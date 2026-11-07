import {
  batchIdentity,
  emitFuzz,
  fuzzReference,
  parityAcrossFuzz,
  planted,
  plantedRollout,
  substepsAtLeast,
} from '../forge/engine.mjs';
import { shCheck } from '../lib/gate.mjs';

export default {
  id: 's1-f6-webgpu',
  stage: 1,
  title: 'F6: WGSL on D3D12, Vulkan and a browser tab',
  state: 'required',
  checks: [
    emitFuzz,
    fuzzReference,
    parityAcrossFuzz('wgpu'),
    batchIdentity('wgpu'),
    substepsAtLeast('wgpu', 400000),
    {
      ...shCheck('a Chrome tab trains Stand to a passing eval within 15 min', 'npx', [
        'vitest',
        'run',
        '--config',
        'vitest.e2e.config.ts',
        '-t',
        'forge tab trains',
      ]),
      timed: true,
    },
  ],
  canaries: [planted, plantedRollout],
};
