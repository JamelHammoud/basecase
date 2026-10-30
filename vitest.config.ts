import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'electron/**/*.test.mjs', 'tools/**/*.test.mjs', 'bench/**/*.test.mjs'],
    exclude: ['bench/data/**', 'bench/runs/**', '**/node_modules/**'],
    environment: 'node',
  },
});
