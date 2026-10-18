import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
