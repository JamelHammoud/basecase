import { defineConfig } from 'vitest/config';
import { vitestCache } from './tools/testing/vitestCache.mjs';

const namesTests = process.argv.some(
  (arg) => arg === '-t' || arg.startsWith('-t=') || arg.startsWith('--testNamePattern'),
);

const cache = vitestCache(import.meta.url);

export default defineConfig({
  cacheDir: cache.cacheDir,
  test: {
    ...cache.test,
    include: ['e2e/app/**/*.app.test.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 180000,
    fileParallelism: false,
    ...(namesTests ? {} : { testNamePattern: /^(?!.*canary claims denial)/ }),
  },
});
