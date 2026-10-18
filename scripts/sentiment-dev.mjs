import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import nextEnv from '@next/env';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: { 'worker-only': { type: 'boolean', default: false },
  production: { type: 'boolean', default: false } }, strict: true });
nextEnv.loadEnvConfig(root, !values.production);
if (!existsSync(path.join(root, 'services/sentiment-node/models/onnx-fp32/model.onnx'))) {
  throw new Error('Restore the offline ONNX FP32 model first; see docs/SENTIMENT_NODE.md.');
}
const url = new URL(process.env.IRIS_SENTIMENT_URL ?? 'http://127.0.0.1:8765');
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Automatic local startup requires a loopback worker URL.');
const port = url.port || '8765';
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function start(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, env: process.env });
  children.add(child);
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { children.delete(child); stop(code ?? 1); });
  return child;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
const worker = start(process.execPath, ['services/sentiment-node/node/server.mjs', '--host', url.hostname, '--port', port]);
if (!values['worker-only']) {
  let ready = false;
  for (let attempt = 0; attempt < 60 && worker.exitCode === null && !stopping; attempt++) {
    try {
      const response = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(1_000) });
      const health = await response.json();
      if (response.ok && health.status === 'ready' && health.schema === 'iris-sentiment-worker/v1'
          && health.release_id === 'iris-sentiment-local/1.0.0' && health.scope_version === 'iris-sentiment-scope/0.3.0'
          && health.backend === 'node-onnx-fp32') { ready = true; break; }
    } catch { /* Model startup has not completed yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) { console.error('Sentiment worker did not become ready.'); stop(1); }
  else start(process.execPath, ['node_modules/next/dist/bin/next', values.production ? 'start' : 'dev', '--hostname', '127.0.0.1']);
}
