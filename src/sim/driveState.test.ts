import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { createDrive, type DriveSetup, type RobotDrive } from './drive';
import { driveAccess } from './driveAccess';
import { poseSetup } from './drivePose';
import type { DriveCommand } from './driveTypes';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf } from './mjcf';

function setupFor(id: string, pose = false): RobotDrive {
  const robot = fixtureRobots().find((fixture) => fixture.id === id)!;
  const rig = buildRig(robot.joints, robot.parts);
  const model = buildMjcf({
    parts: robot.parts,
    rig,
    project: DEFAULT_PROJECT,
    measures: {},
    partTriangles: () => null,
  });
  const access = driveAccess({ rig, parts: robot.parts, model });

  if (pose) return poseSetup(rig, { robot: rig.robots[0].key });

  if (access.kind !== 'ready') throw new Error('The fixture needs a drive.');

  return access.setup;
}

const command = (tick: number): DriveCommand => ({
  v: [Math.sin(tick / 5), 0.4, -0.2],
  aux: [0.3, 0.6],
  ...(tick > 80 ? { joints: { arm0: 12, arm1: -7 } } : {}),
});

describe('drive continuation', () => {
  it('offers no snapshot for a controller without a continuation contract', () => {
    const setup = setupFor('quad-servo');

    expect(setup.kind).toBe('legs');
    expect(createDrive(setup).snapshot?.() ?? null).toBeNull();
  });

  it.each(['arm', 'rover', 'pose', 'team'] as const)('restores the %s controller between scheduled updates', (kind) => {
    const single = setupFor(kind === 'rover' ? 'rover-diff' : 'arm-3dof', kind === 'pose');
    const setup: DriveSetup = kind === 'team' ? { kind: 'team', members: [{ slot: 0, setup: single }] } : single;
    const original = createDrive(setup);
    const restored = createDrive(setup);

    for (let tick = 0; tick < 47; tick++) {
      original.command(command(tick));
      original.tick(tick * 0.002);
    }

    const state = original.snapshot?.();
    const unchanged = structuredClone(state);

    expect(state?.kind).toBe(kind);
    expect(state && restored.restore?.(state)).toBe(true);

    for (let tick = 47; tick < 170; tick++) {
      original.command(command(tick));
      restored.command(command(tick));
      expect(restored.tick(tick * 0.002)).toEqual(original.tick(tick * 0.002));
    }

    expect(state).toEqual(unchanged);
  });

  it('refuses another controller kind without changing the target', () => {
    const arm = createDrive(setupFor('arm-3dof'));
    const rover = createDrive(setupFor('rover-diff'));
    const before = arm.snapshot?.();
    const state = rover.snapshot?.();

    expect(state && arm.restore?.(state)).toBe(false);
    expect(arm.snapshot?.()).toEqual(before);
  });

  it('refuses team membership changes before restoring any member', () => {
    const single = setupFor('rover-diff');
    const drive = createDrive({
      kind: 'team',
      members: [
        { slot: 0, setup: single },
        { slot: 1, setup: single },
      ],
    });
    const state = drive.snapshot?.();

    if (state?.kind !== 'team') throw new Error('The fixture needs a team snapshot.');

    state.members[0].state = { kind: 'rover', command: command(10), speed: 100, lastTime: 3 };
    state.members[1].slot = 2;

    const before = drive.snapshot?.();

    expect(drive.restore?.(state)).toBe(false);
    expect(drive.snapshot?.()).toEqual(before);
  });
});
