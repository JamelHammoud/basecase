import { defineConfig } from 'vitest/config';
import { vitestCache } from './tools/testing/vitestCache.mjs';

const cache = vitestCache(import.meta.url);

export default defineConfig({
  cacheDir: cache.cacheDir,
  test: {
    ...cache.test,
    include: ['scratch/**/*.test.ts', 'scratch/**/*.test.mjs'],
    environment: 'node',
  },
});
