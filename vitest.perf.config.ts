import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.perf.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
