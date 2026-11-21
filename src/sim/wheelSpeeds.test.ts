import { describe, expect, it } from 'vitest';
import { createDrive, type WheelSetup } from './drive';
import { RouteLoop, RouteRunner, type RouteSpec } from './route';
import { wheelSpeeds } from './wheelSpeeds';

const wheels: WheelSetup[] = [
  { joint: 'left', spin: 1, lateralMm: 85, radiusMm: 35 },
  { joint: 'right', spin: -1, lateralMm: -85, radiusMm: 50 },
  { joint: 'tiny', spin: 1, lateralMm: 0, radiusMm: 0.1 },
  { joint: '__proto__', spin: -1, lateralMm: 20, radiusMm: 0 },
  { joint: 'left', spin: -1, lateralMm: 100, radiusMm: 42 },
];

const previousSpeeds = (setup: WheelSetup[], speed: number, turn: number) =>
  Object.fromEntries(
    setup.map((wheel) => [wheel.joint, (wheel.spin * (speed - turn * wheel.lateralMm)) / Math.max(wheel.radiusMm, 1)]),
  );

const route: RouteSpec = {
  keys: [
    { t: 0, forward: 0, left: 0 },
    { t: 1, forward: 0.3, left: 0.2 },
  ],
  gain: 2,
  headingGain: 2,
  deadband: 0.005,
  limits: { forward: [-0.2, 0.2], left: [0, 0], turn: 1 },
};

describe('wheel speed output', () => {
  it('matches the former mixer across reversed axes, radii, duplicate ids and unusual numbers', () => {
    for (const speed of [0, -0, 120, -240, Infinity, NaN]) {
      for (const turn of [0, -0, 0.5, -2, Infinity, NaN]) {
        expect(wheelSpeeds(wheels, speed, turn)).toEqual(previousSpeeds(wheels, speed, turn));
      }
    }

    expect(wheelSpeeds([], 100, 2)).toEqual({});
  });

  it('keeps published outputs independent and overwrites a supplied workspace', () => {
    const first = wheelSpeeds(wheels, 100, 1);
    const next = wheelSpeeds(wheels, -100, -1);
    const workspace = wheelSpeeds(wheels, 0, 0);

    expect(next).not.toBe(first);
    expect(first).toEqual(previousSpeeds(wheels, 100, 1));
    expect(wheelSpeeds(wheels, -100, -1, workspace)).toBe(workspace);
    expect(workspace).toEqual(next);
  });

  it('preserves manual drive ramping, clamping and retained snapshots', () => {
    const drive = createDrive({ kind: 'rover', robot: 'rover', wheels, maxSpeedMmS: 300, maxTurnRadS: 2 });

    drive.command({ v: [2, 0, -2] });

    const initial = drive.tick(0).wheels;
    const moving = drive.tick(0.125).wheels;
    const full = drive.tick(0.25).wheels;

    expect(initial).toEqual(previousSpeeds(wheels, 0, -2));
    expect(moving).toEqual(previousSpeeds(wheels, 150, -2));
    expect(full).toEqual(previousSpeeds(wheels, 300, -2));
    drive.command({ v: [-1, 0, 0] });
    expect(drive.tick(0.75).wheels).toEqual(previousSpeeds(wheels, -300, 0));
    expect(moving).toEqual(previousSpeeds(wheels, 150, -2));
  });

  it('preserves route actuator writes across changing poses, missing joints and duplicate wheel ids', () => {
    const runner = new RouteRunner(
      { kind: 'route', robot: 'rover', route, drive: { kind: 'rover', wheels } },
      {
        rootQpos: 0,
        joints: [
          { id: 'left', actuator: 3 },
          { id: 'right', actuator: -1 },
          { id: '__proto__', actuator: 4 },
        ],
      },
    );
    const reference = new RouteLoop(route);
    const policy = { command: [0, 0, 0] as [number, number, number] };

    for (let step = 0; step < 200; step++) {
      const yaw = step / 40;
      const qpos = [step / 1000, -step / 2000, 0, Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)];
      const data = { qpos, time: step / 100, ctrl: [11, 12, 13, 14, 15] };
      const command = reference.command({ qpos, time: data.time, rootQpos: 0 });
      const expected = previousSpeeds(wheels, command[0] * 1000, command[2]);

      runner.apply(data, policy);
      expect(data.ctrl).toEqual([11, 12, 13, expected.left, expected.__proto__]);
      expect(policy.command).toEqual(command);
    }
  });
});
