import { describe, expect, it } from 'vitest';
import { pointKey } from '../../sim/inputTypes';
import { humanoid } from '../../utils/mocap.fixtures';
import { RAISE_FRAMES, raiseRightArm } from './fixtures/raiseRightArm';
import { humanFrame, pinch, POSE, toHuman } from './poseLandmarks';
import { pointOfTable, pointTable } from './pointTable';

const samples = raiseRightArm();
const hide = (index: number) => samples[0].world.map((p, i) => (i === index ? { ...p, visibility: 0.1 } : p));

describe('humanFrame', () => {
  it('turns MediaPipe world landmarks into a Y-up frame facing +z with the left side on +x', () => {
    const frame = humanFrame(samples[0].world);

    expect(frame.leftShoulder[0]).toBeGreaterThan(0.15);
    expect(frame.rightShoulder[0]).toBeLessThan(-0.15);
    expect(frame.head[1]).toBeGreaterThan(frame.neck[1]);
    expect(frame.chest[1]).toBeGreaterThan(frame.hips[1]);
    expect(frame.chest[1]).toBeLessThan(frame.neck[1]);
    expect(frame.leftAnkle[1]).toBeLessThan(-0.8);
    expect(toHuman(samples[0].world[POSE.nose])[2]).toBeGreaterThan(0.05);
    expect(frame.leftToe[2]).toBeGreaterThan(0.1);
  });

  it('drops a limb landmark it can’t see but keeps the torso', () => {
    expect(humanFrame(hide(POSE.leftKnee)).leftKnee).toBeUndefined();
    expect(humanFrame(hide(POSE.leftShoulder)).leftShoulder).toBeDefined();
    expect(humanFrame(hide(POSE.leftEar)).head).toBeUndefined();
  });
});

describe('pinch', () => {
  it('reads an open left hand as 0 and a pinch as 1', () => {
    expect(pinch(samples[0].world)).toBe(0);
    expect(pinch(samples[RAISE_FRAMES - 1].world)).toBe(1);
    expect(pinch(hide(POSE.leftThumb))).toBe(0);
  });
});

describe('pointTable', () => {
  it('stores bottom and center for every joint and moving part, and reads back like pointOf', () => {
    const { rig, pointOf } = humanoid();
    const table = pointTable(rig, pointOf);
    const read = pointOfTable(table);

    expect(Object.keys(table)).toHaveLength((rig.joints.length + rig.ownerOf.size) * 2);
    expect(table[pointKey('right_elbow_joint', 'center')]).toEqual(pointOf('right_elbow_joint', 'center'));
    expect(read('left_knee_link', 'bottom')).toEqual(pointOf('left_knee_link', 'bottom'));
    expect(read('nothing', 'center')).toBeNull();
    expect(pointTable(rig, pointOf, 'another robot')).toEqual({});
  });
});
