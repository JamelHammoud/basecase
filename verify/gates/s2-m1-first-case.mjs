import { shCheck, vitestCheck } from '../lib/gate.mjs';

export default {
  id: 's2-m1-first-case',
  stage: 2,
  title: 'First Case: Touch the Dots on two arms, with a world layer and live input',
  state: 'required',
  checks: [
    vitestCheck('Touch the Dots passes on two arms; limp fails; refusals are plain', 'verify/cases/touchdots.test.ts'),
    shCheck('Case and drive unit tests pass', 'npx', ['vitest', 'run', 'src/cases', 'src/sim/drive']),
    shCheck('Types hold', 'npx', ['tsc', '-b']),
  ],
  canaries: [
    shCheck('a Case whose reference misses is caught', 'npx', ['vitest', 'run', 'src/cases/canary.canary.ts']),
  ],
};
