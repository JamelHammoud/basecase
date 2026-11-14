import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { Recording } from '../sim/recorder';
import type { Contract } from '../skills/contract';
import { buildRig } from '../utils/kinematics';
import { caseStages } from './caseStages';
import { segmentInputOf } from './segmentInput';

const lift = { atom: { expr: { delta: { signal: 'lift' } }, cmp: '>', value: 10, scale: 10 } } as const;
const onSpot = { atom: { expr: { signal: 'spot' }, cmp: '<', value: 5, scale: 5 } } as const;

const contract = (success: Contract['success']): Contract => ({ version: 1, success, failures: [] });

describe('Case stages', () => {
  it('begin where each step of a sequence is first met, in order', () => {
    const trace = { dt: 0.02, signals: { lift: [3, 3, 8, 14, 20, 20], spot: [9, 9, 9, 9, 4, 4] } };
    const stages = caseStages(
      contract({
        sequence: [{ eventually: { window: 'whole', state: lift } }, { always: { window: 'whole', state: onSpot } }],
      }),
      trace,
    );

    expect(stages).toEqual([3]);
  });

  it('are none for a Case with no sequence, or a step never met', () => {
    const trace = { dt: 0.02, signals: { lift: [0, 0, 0], spot: [1, 1, 1] } };

    expect(caseStages(contract({ eventually: { window: 'whole', state: lift } }), trace)).toEqual([]);
    expect(
      caseStages(
        contract({
          sequence: [
            { eventually: { window: 'whole', state: lift } },
            { eventually: { window: 'whole', state: onSpot } },
          ],
        }),
        trace,
      ),
    ).toEqual([]);
  });
});

describe('a real try’s segment input', () => {
  it('finds the gripper’s jaws by the try’s own joint order, with no model and no objects', () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const rig = buildRig(arm.joints, arm.parts);
    const joints = ['finger_right', 'arm0', 'arm1', 'arm2', 'arm3', 'arm4', 'arm5', 'finger_left'];
    const recording = { frames: 0, nq: 8, jointQpos: Int32Array.from([0, 1, 2, 3, 4, 5, 6, 7]) } as Recording;
    const input = segmentInputOf({ recording, model: null, rig, parts: arm.parts, kase: null, kind: 'real', joints });

    expect(input.jaws).toEqual([
      { qpos: 7, open: 0, closed: 0.025 },
      { qpos: 0, open: 0, closed: -0.025 },
    ]);
    expect(input).toMatchObject({ objects: [], stages: [], base: 'fixed', model: null });
    expect(input.hand?.part).toBe('link5');
  });
});
