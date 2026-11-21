import { defineConfig } from 'vitest/config';
import { vitestCache } from '../tools/testing/vitestCache.mjs';

const cache = vitestCache(import.meta.url);

export default defineConfig({
  cacheDir: cache.cacheDir,
  test: {
    ...cache.test,
    include: ['verify/**/*.test.ts', 'verify/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 600000,
    hookTimeout: 300000,
  },
});
