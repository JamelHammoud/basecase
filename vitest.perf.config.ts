import { defineConfig } from 'vitest/config';
import { vitestCache } from './tools/testing/vitestCache.mjs';

const cache = vitestCache(import.meta.url);

export default defineConfig({
  cacheDir: cache.cacheDir,
  test: {
    ...cache.test,
    include: ['src/**/*.perf.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
