import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AsyncPanel } from './AsyncPanel';

it('streams a ready panel while an independent panel is still waiting', async () => {
  let resolveSlow!: (value: string) => void;
  const slow = new Promise<string>((resolve) => { resolveSlow = resolve; });
  const output = new PassThrough();
  let html = '';
  let ready!: () => void;
  const fastArrived = new Promise<void>((resolve) => { ready = resolve; });
  const finished = new Promise<void>((resolve, reject) => {
    output.on('end', resolve);
    output.on('error', reject);
  });
  output.on('data', (chunk) => {
    html += chunk.toString();
    if (html.includes('fast-ready')) ready();
  });
  const render = renderToPipeableStream(<html><body>
    <AsyncPanel title="Slow feed" data={slow}>{(value) => <p>{value}</p>}</AsyncPanel>
    <AsyncPanel title="Fast feed" data={Promise.resolve('fast-ready')}>{(value) => <p>{value}</p>}</AsyncPanel>
  </body></html>, { onShellReady() { render.pipe(output); }, onError(error) { output.destroy(error as Error); } });
  try {
    await fastArrived;
    expect(html).toContain('Loading Slow feed');
    expect(html).not.toContain('slow-ready');
    resolveSlow('slow-ready');
    await finished;
    expect(html).toContain('slow-ready');
  } finally {
    render.abort();
    output.destroy();
  }
});

