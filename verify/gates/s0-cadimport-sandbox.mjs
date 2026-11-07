import { shCheck } from '../lib/gate.mjs';

const appTest = (name, filter, env = {}) =>
  shCheck(name, 'npx', ['vitest', 'run', '--config', 'vitest.app.config.ts', '-t', filter], {
    env: { ...process.env, ...env },
  });

export default {
  id: 's0-cadimport-sandbox',
  stage: 0,
  title: 'Downloaded CAD files are converted in a Chromium sandbox on every OS',
  state: 'required',
  checks: [
    shCheck('the app bundles', 'npx', ['vite', 'build']),
    shCheck('an unsigned app packages', 'npx', ['electron-builder', '--dir', '--publish', 'never']),
    shCheck('converter, parts pipeline and security unit tests pass', 'npx', [
      'vitest',
      'run',
      'electron/cadImport',
      'electron/cad-kernel/sandbox',
      'electron/security.test.mjs',
      'tools/parts',
    ]),
    appTest(
      'the fixture STEP and zip convert to the same GLB bytes as before the move, and an STL is refused as before',
      'cadimport sandbox converts',
    ),
    appTest(
      'probe: converter code cannot read or write files under home, reach the network, spawn or read the environment (each denied within 5 s)',
      'cadimport sandbox denies',
    ),
    appTest(
      'a parse that never returns is stopped within 10 s, one that eats memory within 90 s, and the next file converts',
      'cadimport sandbox recovers',
    ),
  ],
  canaries: [
    appTest(
      'the same probes, with the converter run unsandboxed, are seen to get through',
      'cadimport sandbox canary claims denial',
      { BASECASE_CADIMPORT_UNSANDBOXED: '1' },
    ),
  ],
};
