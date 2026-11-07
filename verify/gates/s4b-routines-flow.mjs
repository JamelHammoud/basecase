import { shCheck, vitestCheck } from '../lib/gate.mjs';

const SOAK = ['build', '--release', '--manifest-path', 'hw/Cargo.toml', '--bin', 'routine-soak'];

export default {
  id: 's4b-routines-flow',
  stage: 4,
  title: 'Routines: flow builder, L1 physics scenarios and the greeting from one sentence',
  state: 'required',
  checks: [
    vitestCheck('the flow round-trips the schema and lights from trace events', 'verify/routines/flow.test.ts'),
    vitestCheck('capabilities come from the scene', 'verify/routines/capabilities.test.ts'),
    vitestCheck('acceptance scenarios written from the sentence pass on mocks', 'verify/routines/acceptance.test.ts'),
    vitestCheck(
      'L1: the greeting walks, greets and turns in MuJoCo with Kit skills; untrained skills are refused',
      'verify/routines/physics.test.ts',
    ),
    vitestCheck(
      'in the app: one sentence to a passing Routine in under 8 actions, live trace, Add Camera, Needs Training',
      'verify/routines/flow.e2e.test.ts',
    ),
    shCheck('the soak harness builds', 'cargo', SOAK),
    {
      ...vitestCheck(
        'fake-bus soak with saturated workers and a hung LLM keeps p99.9 jitter under 2 ms',
        'verify/routines/soak.test.ts',
      ),
      timed: true,
    },
    shCheck('Routine unit tests pass', 'npx', ['vitest', 'run', 'src/routines']),
  ],
  canaries: [
    vitestCheck('a Routine whose person watcher never fires is caught', 'verify/routines/canaryWatcher.test.ts'),
    vitestCheck('a flow edit that drops a timeout path is refused', 'verify/routines/canaryTimeout.test.ts'),
    vitestCheck('a trace event for a node not in the graph is rejected', 'verify/routines/canaryTrace.test.ts'),
  ],
};
