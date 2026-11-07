import { shCheck } from '../lib/gate.mjs';
import {
  batchIdentity,
  emitFuzz,
  fuzzReference,
  parityAcrossFuzz,
  planted,
  plantedRollout,
  substepsAtLeast,
} from '../forge/engine.mjs';
import { FORGE_MANIFEST } from '../forge/run.mjs';

export default {
  id: 's1-f3-simd-engine',
  stage: 1,
  title: 'F3: Forge engine on SIMD, parity with C MuJoCo, at least 2x its speed',
  state: 'required',
  checks: [
    shCheck('forge-sim builds', 'cargo', ['build', '--release', '--manifest-path', FORGE_MANIFEST, '-p', 'forge-sim']),
    shCheck('forge-ir emits kernels and refuses unsupported MJCF', 'cargo', [
      'test',
      '--release',
      '--manifest-path',
      FORGE_MANIFEST,
      '-p',
      'forge-ir',
    ]),
    emitFuzz,
    fuzzReference,
    parityAcrossFuzz('simd'),
    batchIdentity('simd'),
    substepsAtLeast('simd', 1100000, { envs: 1024, seconds: 30 }),
  ],
  canaries: [planted, plantedRollout],
};
