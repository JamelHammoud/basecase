import {
  batchIdentity,
  emitFuzz,
  fuzzReference,
  parityAcrossFuzz,
  planted,
  plantedRollout,
  substepsAtLeast,
} from '../forge/engine.mjs';

export default {
  id: 's1-f4-metal',
  stage: 1,
  title: 'F4: Metal backend, same vectors, 1M substeps/s sustained',
  state: 'required',
  checks: [
    emitFuzz,
    fuzzReference,
    parityAcrossFuzz('metal'),
    batchIdentity('metal'),
    substepsAtLeast('metal', 1000000),
  ],
  canaries: [planted, plantedRollout],
};
