import { defineConfig } from 'vitest/config';
import { vitestCache } from './tools/testing/vitestCache.mjs';
import { quarantineExclude } from './tools/quarantine.mjs';

const cache = vitestCache(import.meta.url);

export default defineConfig({
  cacheDir: cache.cacheDir,
  test: {
    ...cache.test,
    include: [
      'src/**/*.test.ts',
      'electron/**/*.test.mjs',
      'tools/**/*.test.mjs',
      'bench/**/*.test.mjs',
      'verify/lib/*.test.mjs',
    ],
    exclude: ['bench/data/**', 'bench/runs/**', '**/node_modules/**', '**/*.perf.test.ts', ...quarantineExclude()],
    setupFiles: ['tools/quarantine-setup.mjs'],
    environment: 'node',
  },
});
