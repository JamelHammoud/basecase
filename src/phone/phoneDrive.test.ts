import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { robotFacts } from '../cases/robotFit';
import { caseRobot } from '../cases/testing';
import { driveAccess } from '../sim/driveAccess';
import { SimEngine } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { phoneCommand, pressedButtons, tiltAxis, type PhoneReading } from './phoneDrive';

const STEP_S = 0.02;

const phone = (forwardDeg: number, leftDeg = 0): PhoneReading => ({
  tilt: [-forwardDeg, -leftDeg],
  pad: null,
  buttons: [false, false],
});

function driven(mj: MainModule, id: string) {
  const r = fixtureRobots().find((x) => x.id === id)!;
  const rig = buildRig(r.joints, r.parts);
  const model = buildMjcf({ ...caseRobot(r), rig, project: DEFAULT_PROJECT });
  const access = driveAccess({ rig, parts: r.parts, model });

  if (access.kind !== 'ready') throw new Error(`${id} should drive.`);

  const engine = new SimEngine(mj, model);

  engine.setController({ kind: 'drive', setup: access.setup });
  engine.step(1);

  const hold = (reading: PhoneReading, seconds: number) => {
    for (let t = 0; t < seconds; t += STEP_S) {
      engine.command(phoneCommand(reading, access.cls));
      engine.step(STEP_S);
    }
  };

  return { engine, hold, rig, parts: r.parts, cls: access.cls };
}

describe('steering by tilting a phone', () => {
  it('reads a level phone as still and a 25° tilt as full', () => {
    expect([tiltAxis(0), tiltAxis(3), tiltAxis(-3)]).toEqual([0, 0, 0]);
    expect(tiltAxis(25)).toBe(1);
    expect(tiltAxis(-40)).toBe(-1);
    expect(tiltAxis(20)).toBeCloseTo(16 / 21);
  });

  it.each(['quad-servo', 'rover-diff'])(
    'a 20° forward tilt drives the %s fixture forward, and a level phone stops it',
    async (id) => {
      const { engine, hold, cls } = driven(await loadMujoco(), id);

      expect(cls).toBe(id === 'rover-diff' ? 'rover' : 'legs');
      hold(phone(20), 4);

      const moved = engine.stats().robots[0];

      expect(moved.forward).toBeGreaterThan(0.1);
      expect(moved.fellAt).toBeNull();
      hold(phone(0), 1);

      const before = engine.stats().robots[0].forward;

      hold(phone(0), 1);
      expect(Math.abs(engine.stats().robots[0].forward - before)).toBeLessThan(0.02);
      engine.dispose();
    },
  );

  it('moves an arm’s hand target forward on a tilt, never past its reach', async () => {
    const { engine, hold, rig, parts } = driven(await loadMujoco(), 'arm-6dof');
    const { anchor, reachMm } = robotFacts(rig, parts);
    const start = engine.stats().effector!;

    hold(phone(20), 1);

    const tilted = engine.stats().effector!;

    hold(phone(25, 25), 6);

    const far = engine.stats().effector!;
    const fromAnchor = Math.hypot(...far.map((x, i) => x - anchor[i]));

    expect(tilted[2] - start[2]).toBeGreaterThan(40);
    expect(fromAnchor).toBeLessThanOrEqual(reachMm);
    engine.dispose();
  });

  it('closes the grip with A, lifts the hand with the pad, and names each new press', () => {
    const pressed: PhoneReading = { tilt: [0, 0], pad: [0, 1], buttons: [true, false] };

    expect(phoneCommand(pressed, 'arm')).toEqual({ v: [0, 0, 0], aux: [1, 1] });
    expect(pressedButtons(null, [true, false])).toEqual(['a']);
    expect(pressedButtons([true, false], [true, true])).toEqual(['b']);
    expect(pressedButtons([true, true], [true, true])).toEqual([]);
  });
});
