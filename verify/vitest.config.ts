import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['verify/**/*.test.ts', 'verify/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 600000,
    hookTimeout: 300000,
  },
});
