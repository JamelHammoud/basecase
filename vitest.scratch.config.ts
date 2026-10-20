import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scratch/**/*.test.ts', 'scratch/**/*.test.mjs'],
    environment: 'node',
  },
});
