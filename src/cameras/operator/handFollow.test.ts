import { describe, expect, it } from 'vitest';
import { caseRobot } from '../../cases/testing';
import { driveAccess } from '../../sim/driveAccess';
import { inputRobot } from '../../sim/driveSession';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { InputRobot } from '../../sim/inputTypes';
import { buildMjcf } from '../../sim/mjcf';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { HAND_FRAMES, HAND_MOVE_M, HAND_MOVED_AT, handMovesRight } from './fixtures/handMovesRight';
import { createHandFollower, handPinch, type HandFollow } from './handFollow';
import { FALLBACK_ARM_M } from './tipFollow';

function armTip(): Extract<InputRobot, { kind: 'tip' }> {
  const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const rig = buildRig(arm.joints, arm.parts);
  const model = buildMjcf({ ...caseRobot(arm), rig, project: DEFAULT_PROJECT });
  const access = driveAccess({ rig, parts: arm.parts, model, pose: true });

  if (access.kind !== 'ready') throw new Error(`expected an arm drive, got ${access.kind}`);

  const robot = inputRobot(access, { rig, parts: arm.parts, viewport: null });

  if (robot?.kind !== 'tip') throw new Error('expected a hand target');

  return robot;
}

describe('createHandFollower on a fixed arm', () => {
  const robot = armTip();
  const samples = handMovesRight();
  const outputs = samples.map(createHandFollower(robot).step);
  const follows = outputs.filter((o): o is HandFollow & { target: [number, number, number] } => !!o?.target);
  const last = follows.at(-1)!;
  const expected = (HAND_MOVE_M * robot.reachMm) / FALLBACK_ARM_M;

  it('follows every frame of a seen hand', () => {
    expect(follows).toHaveLength(HAND_FRAMES);
    expect(Math.hypot(...follows[0].target.map((v, i) => v - robot.start[i]))).toBeLessThan(1e-9);
  });

  it('moves the end-effector target right by the hand’s 10 cm, scaled to the arm’s reach', () => {
    const [dx, dy, dz] = last.target.map((v, i) => v - robot.start[i]);

    expect(dx).toBeGreaterThan(expected * 0.85);
    expect(dx).toBeLessThan(expected * 1.15);
    expect(Math.abs(dy)).toBeLessThan(expected * 0.15);
    expect(Math.abs(dz)).toBeLessThan(expected * 0.15);
  });

  it('stays still while the hand rests', () => {
    const resting = follows.slice(0, 30).map((f) => Math.abs(f.target[0] - robot.start[0]));

    expect(Math.max(...resting)).toBeLessThan(expected * 0.05);
    expect(follows[HAND_MOVED_AT].target[0] - robot.start[0]).toBeGreaterThan(expected * 0.7);
  });

  it('closes the grip when the thumb meets the index finger', () => {
    expect(follows[HAND_MOVED_AT].grip).toBeLessThan(0.1);
    expect(last.grip).toBeGreaterThan(0.9);
    expect(handPinch(samples[0].world)).toBe(0);
  });
});
