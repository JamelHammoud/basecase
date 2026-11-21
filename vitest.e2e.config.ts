import { configDefaults, defineConfig } from 'vitest/config';
import { vitestCache } from './tools/testing/vitestCache.mjs';
import { quarantineExclude } from './tools/quarantine.mjs';

const cache = vitestCache(import.meta.url);

export default defineConfig({
  cacheDir: cache.cacheDir,
  test: {
    ...cache.test,
    include: ['e2e/**/*.e2e.test.ts'],
    exclude: [...configDefaults.exclude, ...quarantineExclude()],
    setupFiles: ['tools/quarantine-setup.mjs'],
    globalSetup: ['e2e/serve.ts'],
    environment: 'node',
    testTimeout: 180000,
    hookTimeout: 120000,
    fileParallelism: false,
    retry: process.env.CI ? 1 : 0,
    expect: { poll: { timeout: 10000 } },
  },
});
