import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/app/**/*.app.test.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 180000,
    fileParallelism: false,
  },
});
