import { describe, expect, it } from 'vitest';
import { humanoid } from '../utils/mocap.fixtures';
import { createDrive } from './drive';
import { CONTROL_DT } from './driveTiming';
import { hasArms, POSE_RATE_PER_SECOND, poseJoints, poseSetup, type PoseSetup } from './drivePose';

const setup = (rate = POSE_RATE_PER_SECOND): PoseSetup => ({
  kind: 'pose',
  robot: 'robot',
  joints: [
    { id: 'shoulder', range: [-90, 45] },
    { id: 'elbow', range: [0, 120] },
    { id: 'free', range: null },
  ],
  start: { shoulder: 0, elbow: 10, free: 0 },
  rate,
});

const run = (seconds: number, drive = createDrive(setup())) => {
  let out = drive.tick(0).values ?? {};

  for (let t = CONTROL_DT; t <= seconds + 1e-9; t += CONTROL_DT) out = drive.tick(t).values ?? {};

  return out;
};

describe('pose drive', () => {
  it('holds its start until a joints command arrives', () => {
    expect(run(0.5)).toEqual({ shoulder: 0, elbow: 10, free: 0 });
  });

  it('clamps every target to its joint range', () => {
    const drive = createDrive(setup());

    drive.command({ v: [0, 0, 0], joints: { shoulder: -170, elbow: 400, free: 30 } });

    expect(run(3, drive)).toEqual({ shoulder: -90, elbow: 120, free: 30 });
  });

  it('moves no faster than its rate each tick', () => {
    const drive = createDrive(setup(100));
    const step = 100 * CONTROL_DT;

    drive.command({ v: [0, 0, 0], joints: { shoulder: -60 } });

    const first = drive.tick(0).values!;
    const second = drive.tick(CONTROL_DT).values!;

    expect(first.shoulder).toBeCloseTo(-step);
    expect(second.shoulder).toBeCloseTo(-2 * step);
    expect(drive.tick(CONTROL_DT * 1.5).values!.shoulder).toBeCloseTo(-2 * step);
  });

  it('ignores joints it doesn’t drive and values that aren’t numbers', () => {
    const drive = createDrive(setup());

    drive.command({ v: [0, 0, 0], joints: { left_knee_joint: 50, elbow: Number.NaN } });

    expect(run(1, drive)).toEqual({ shoulder: 0, elbow: 10, free: 0 });
  });
});

describe('pose joints', () => {
  it('drives a humanoid’s arms, waist and head but never its legs', () => {
    const { rig } = humanoid();
    const ids = poseJoints(rig).map((j) => j.id);

    expect(hasArms(rig)).toBe(true);
    expect(ids.filter((id) => /hip|knee|ankle/.test(id))).toEqual([]);
    expect(ids.filter((id) => /^right_(shoulder|elbow|wrist)/.test(id))).toHaveLength(7);
  });

  it('starts each joint at its pose', () => {
    const { rig } = humanoid();
    const made = poseSetup(rig, { robot: rig.robots[0].key, start: { right_elbow_joint: 30 } });

    expect(made.start.right_elbow_joint).toBe(30);
    expect(made.start.left_elbow_joint).toBe(0);
  });
});
