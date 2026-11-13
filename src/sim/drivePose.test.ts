import { describe, expect, it } from 'vitest';
import { isIdle, sameCommand } from './driveKeys';
import { POSE_DEG_PER_S, POSE_DT, POSE_MM_PER_S, PoseDrive, type PoseSetup } from './drivePose';

const STILL: [number, number, number] = [0, 0, 0];

const setup = (start: Record<string, number> = {}): PoseSetup => ({
  kind: 'pose',
  robot: 'r',
  joints: [
    { id: 'shoulder', range: [-90, 90] },
    { id: 'elbow', range: [0, 150] },
    { id: 'slide', range: [0, 40], prismatic: true },
  ],
  start,
});

function ticks(drive: PoseDrive, options: { from: number; count: number }) {
  let values: Record<string, number> = {};

  for (let k = 0; k < options.count; k++) values = drive.tick(options.from + k * POSE_DT).values ?? {};

  return values;
}

describe('pose drive', () => {
  it('starts inside each joint’s range', () => {
    const drive = new PoseDrive(setup({ shoulder: 200, elbow: -20 }));

    expect(drive.tick(0).values).toEqual({ shoulder: 90, elbow: 0, slide: 0 });
  });

  it('clamps a command beyond a joint’s range to the range', () => {
    const drive = new PoseDrive(setup());

    drive.command({ v: STILL, joints: { shoulder: 400, elbow: -60, slide: 900 } });

    expect(ticks(drive, { from: 0, count: 200 })).toEqual({ shoulder: 90, elbow: 0, slide: 40 });
  });

  it('moves a revolute joint at most 240°/s toward a far goal and reaches it', () => {
    const most = POSE_DEG_PER_S * POSE_DT;
    const drive = new PoseDrive(setup());

    drive.command({ v: STILL, joints: { shoulder: 60 } });

    expect(most).toBeCloseTo(4.8);
    expect(drive.tick(0).values?.shoulder).toBeCloseTo(most);
    expect(drive.tick(POSE_DT).values?.shoulder).toBeCloseTo(2 * most);
    expect(ticks(drive, { from: 2 * POSE_DT, count: 10 }).shoulder).toBeCloseTo(12 * most);
    expect(ticks(drive, { from: 12 * POSE_DT, count: 2 }).shoulder).toBe(60);
  });

  it('moves a prismatic joint at most 250 mm/s', () => {
    const drive = new PoseDrive(setup());

    drive.command({ v: STILL, joints: { slide: 40 } });

    expect(drive.tick(0).values?.slide).toBeCloseTo(POSE_MM_PER_S * POSE_DT);
    expect(ticks(drive, { from: POSE_DT, count: 8 }).slide).toBe(40);
  });

  it('ignores commands without joints, unknown joint ids and NaN', () => {
    const drive = new PoseDrive(setup({ shoulder: 10 }));

    drive.command({ v: [1, 0, 0] });
    drive.command({ v: STILL, joints: { wrist: 30, shoulder: Number.NaN, elbow: Number.POSITIVE_INFINITY } });

    expect(ticks(drive, { from: 0, count: 20 })).toEqual({ shoulder: 10, elbow: 0, slide: 0 });
  });

  it('holds between ticks', () => {
    const drive = new PoseDrive(setup());

    drive.command({ v: STILL, joints: { shoulder: 60 } });

    const first = drive.tick(1).values;

    expect(drive.tick(1).values).toEqual(first);
    expect(drive.tick(1 + POSE_DT / 2).values).toEqual(first);
    expect(drive.tick(1 + POSE_DT).values?.shoulder).toBeGreaterThan(first?.shoulder ?? 0);
  });
});

describe('pose commands', () => {
  it('compares joint targets', () => {
    expect(sameCommand({ v: STILL, joints: { a: 10, b: 20 } }, { v: STILL, joints: { b: 20, a: 10 } })).toBe(true);
    expect(sameCommand({ v: STILL, joints: { a: 10 } }, { v: STILL, joints: { a: 11 } })).toBe(false);
    expect(sameCommand({ v: STILL, joints: { a: 10 } }, { v: STILL, joints: { a: 10, b: 0 } })).toBe(false);
    expect(sameCommand({ v: STILL }, { v: STILL, joints: { a: 10 } })).toBe(false);
  });

  it('is not idle while it carries joint targets', () => {
    expect(isIdle({ v: STILL })).toBe(true);
    expect(isIdle({ v: STILL, joints: { a: 0 } })).toBe(false);
  });
});
