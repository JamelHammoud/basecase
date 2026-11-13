import { defineConfig } from 'vitest/config';
import { quarantineExclude } from './tools/quarantine.mjs';

export default defineConfig({
  test: {
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
