import { shCheck, vitestCheck } from '../lib/gate.mjs';

const MANIFEST = 'hw/coordinator/Cargo.toml';

export default {
  id: 's4-routines-core',
  stage: 4,
  title: 'Routines: schema, compiler, coordinator and scenario tests on mocks',
  state: 'required',
  checks: [
    shCheck('coordinator crate tests pass', 'cargo', ['test', '--release', '--manifest-path', MANIFEST]),
    shCheck('coordinator builds to WASM', 'cargo', [
      'build',
      '--release',
      '--manifest-path',
      MANIFEST,
      '--target',
      'wasm32-unknown-unknown',
    ]),
    vitestCheck('greeting Routine, compiler refusals, determinism and mutants', 'verify/routines/routines.test.ts'),
    shCheck('Routine unit tests pass', 'npx', ['vitest', 'run', 'src/routines']),
  ],
  canaries: [vitestCheck('a Routine naming strangers is caught', 'verify/routines/canary.test.ts')],
};
