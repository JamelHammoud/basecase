import { describe, expect, it } from 'vitest';
import { act, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from './policy';

const spec = (extra: Partial<PolicySpec> = {}): PolicySpec => ({
  format: POLICY_FORMAT,
  version: POLICY_VERSION,
  task: 'walk',
  robot: 'Robot',
  joints: ['a', 'b'],
  defaultPose: [0, 0],
  actionScale: 0.25,
  controlDt: 0.02,
  command: [0.25, 0, 0],
  obsMean: [0],
  obsStd: [1],
  layers: [{ in: 1, out: 2, w: [0.5, 3], b: [0, 0] }],
  activation: 'elu',
  trainedSteps: 0,
  mujoco: '4.0.0',
  createdAt: '',
  ...extra,
});

describe('policy actions', () => {
  it('clips the output when the policy has no squash', () => {
    const a = act(spec(), Float32Array.from([1]));

    expect(a[0]).toBeCloseTo(0.5);
    expect(a[1]).toBe(1);
  });

  it('applies tanh before clipping for a squashed policy', () => {
    const a = act(spec({ squash: 'tanh' }), Float32Array.from([1]));

    expect(a[0]).toBeCloseTo(Math.tanh(0.5));
    expect(a[1]).toBeCloseTo(Math.tanh(3));
  });
});
