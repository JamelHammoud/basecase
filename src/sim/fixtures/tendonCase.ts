import type { Case } from '../../cases/schema';

export const remoteElbowCase: Case = {
  formatVersion: 1,
  id: 'remote-elbow',
  name: 'Remote elbow',
  brief: 'Record the motor spool and passive elbow together.',
  slot: { needs: [], binding: {} },
  world: { objects: [] },
  controls: [],
  reference: {
    timeline: [
      { at: 0, joints: { motor_0: -20 } },
      { at: 0.3, joints: { motor_0: 30 } },
    ],
  },
  task: {
    seconds: 1,
    probes: [],
    contract: {
      version: 1,
      success: {
        eventually: {
          window: 'whole',
          state: { atom: { expr: { signal: 'elapsed' }, cmp: '>=', value: 0.6, scale: 1 } },
        },
      },
      failures: [],
    },
  },
};
