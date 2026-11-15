import { describe, expect, it } from 'vitest';
import type { RobotRun } from '../robot/runBuffer';
import type { SimModel } from '../sim/mjcfTypes';
import { bodyErrorUnits, bodyRunWindow, excitedBodyJoints } from './bodyRun';

const run: RobotRun = {
  joints: ['moving', 'still', 'other'],
  statuses: [
    { at: 0, positions: [0, 0, 0] },
    { at: 100, positions: [0.1, 0, 0.4] },
    { at: 200, positions: [0.2, 0, 0.8] },
  ],
  intents: [{ at: 50, joints: [0.2, 0, 0.8] }],
  faultJoint: null,
  faultAt: 0,
  message: '',
};
const model = {
  joints: [
    { id: 'moving', robot: 'arm', type: 'revolute' },
    { id: 'still', robot: 'arm', type: 'revolute' },
    { id: 'other', robot: 'another', type: 'revolute' },
  ],
} as SimModel;

describe('recorded body fit window', () => {
  it('derives error units only from the joints selected for scoring', () => {
    const mixed = {
      ...model,
      joints: model.joints.map((joint, i) => ({
        ...joint,
        type: i === 0 ? ('prismatic' as const) : ('revolute' as const),
      })),
    };

    expect(bodyErrorUnits(model, run, [0])).toBe('rad');
    expect(bodyErrorUnits(mixed, run, [0])).toBe('m');
    expect(bodyErrorUnits(mixed, run, [0, 1])).toBe('mixed');
  });

  it('starts at a measured state after accepted intents start without changing the recording', () => {
    const window = bodyRunWindow(run);

    expect(window.statuses.map((status) => status.at)).toEqual([100, 200]);
    expect(window.intents).toBe(run.intents);
    expect(run.statuses).toHaveLength(3);
    expect(bodyRunWindow({ ...run, intents: [] }).statuses).toBe(run.statuses);
  });

  it('scores the moving joints of the selected robot without stationary joints masking an error', () => {
    expect(excitedBodyJoints(model, 'arm', run)).toEqual([0]);
    expect(excitedBodyJoints(model, 'another', run)).toEqual([2]);
    expect(excitedBodyJoints(model, 'missing', run)).toEqual([]);
    expect(
      excitedBodyJoints(model, 'arm', { ...run, statuses: run.statuses.map((s) => ({ ...s, positions: [0, 0, 0] })) }),
    ).toEqual([]);
  });
});
