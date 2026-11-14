import { describe, expect, it } from 'vitest';
import { POSE_EPSILON, PoseGate } from './poseGate';

const pose = (...values: number[]) => Float64Array.from(values);

describe('PoseGate', () => {
  it('lets the first pose through and holds back the same pose after it', () => {
    const gate = new PoseGate();

    expect(gate.moved(pose(0.1, 0.2, 0.3, 1, 0, 0, 0))).toBe(true);
    expect(gate.moved(pose(0.1, 0.2, 0.3, 1, 0, 0, 0))).toBe(false);
  });

  it('holds back contact jitter smaller than the epsilon', () => {
    const gate = new PoseGate();

    gate.moved(pose(0.1, 0.2, 0.3, 1, 0, 0, 0));

    expect(gate.moved(pose(0.1 + POSE_EPSILON / 2, 0.2, 0.3, 1, 0, 0, 0))).toBe(false);
  });

  it('compares against the last pose it let through, so slow drift still shows', () => {
    const gate = new PoseGate();
    const step = POSE_EPSILON * 0.6;

    gate.moved(pose(0));

    expect(gate.moved(pose(step))).toBe(false);
    expect(gate.moved(pose(step * 2))).toBe(true);
    expect(gate.moved(pose(step * 2))).toBe(false);
  });

  it('lets a pose through when the model changes size or after a reset', () => {
    const gate = new PoseGate();

    gate.moved(pose(0, 0));

    expect(gate.moved(pose(0, 0, 0))).toBe(true);

    gate.reset();

    expect(gate.moved(pose(0, 0, 0))).toBe(true);
  });
});
