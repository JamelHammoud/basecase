import { defineConfig } from 'vitest/config';

const namesTests = process.argv.some(
  (arg) => arg === '-t' || arg.startsWith('-t=') || arg.startsWith('--testNamePattern'),
);

export default defineConfig({
  test: {
    include: ['e2e/app/**/*.app.test.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 180000,
    fileParallelism: false,
    ...(namesTests ? {} : { testNamePattern: /^(?!.*canary claims denial)/ }),
  },
});
