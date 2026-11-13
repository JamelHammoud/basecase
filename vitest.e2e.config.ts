import { configDefaults, defineConfig } from 'vitest/config';
import { quarantineExclude } from './tools/quarantine.mjs';

export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    exclude: [...configDefaults.exclude, ...quarantineExclude()],
    setupFiles: ['tools/quarantine-setup.mjs'],
    globalSetup: ['e2e/serve.ts'],
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
    expect: { poll: { timeout: 10000 } },
  },
});
