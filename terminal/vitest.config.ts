import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors the `@/*` path in tsconfig.json. Without it, any test that reaches a
  // module using the alias fails to resolve — which silently limited tests to
  // files with no cross-module imports.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
