import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { robotFacts } from '../cases/robotFit';
import { caseRobot } from '../cases/testing';
import { DEFAULT_PROJECT } from '../types/robotics';
import { alternatingPhases } from '../utils/gait';
import { buildRig } from '../utils/kinematics';
import {
  driveAccess,
  driveOffer,
  type VelocityDrive,
  FALL_CHECK_SECONDS,
  FALL_CHECK_SETTLE_SECONDS,
  fallCheckCommands,
  fallCheckPassed,
  policyCommand,
  withVelocity,
} from './driveAccess';
import { commandFromKeys, commandFromPad, mergeCommands, sameCommand } from './driveKeys';
import { footPoints } from './driveLegs';
import { SimEngine } from './engine';
import { box } from './fixtures/parts';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf, simDeltas, type WorldItem } from './mjcf';
import type { PolicySpec } from './policy';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const yawOf = (engine: SimEngine) => {
  const p = engine.poses();
  const [w, x, y, z] = [p[3], p[4], p[5], p[6]];

  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
};

const yawChange = (engine: SimEngine, seconds: number) => {
  const before = yawOf(engine);

  engine.step(seconds);

  return yawOf(engine) - before;
};

function walker(id: string, velocity: VelocityDrive | null = null) {
  const r = robot(id);
  const rig = buildRig(r.joints, r.parts);
  const model = buildMjcf({ ...caseRobot(r), rig, project: DEFAULT_PROJECT });
  const access = driveAccess({ rig, parts: r.parts, model, velocity });

  return { r, rig, model, access };
}

const offer = (id: string, velocityReady = false) => {
  const r = robot(id);

  return driveOffer({ rig: buildRig(r.joints, r.parts), parts: r.parts, velocityReady });
};

const stubVelocity = { policy: { joints: [] } as unknown as PolicySpec, topSpeed: 0.15 };

function fallCheck(mj: MainModule, id: string) {
  const { model, access } = walker(id);

  if (access.kind !== 'ready') return access.kind;

  const engine = new SimEngine(mj, model);

  engine.setController({ kind: 'drive', setup: access.setup });
  engine.step(FALL_CHECK_SETTLE_SECONDS);
  engine.command(fallCheckCommands()[0].command);
  engine.step(FALL_CHECK_SECONDS);

  const lift = model.initial.roots?.[model.robots[0].key]?.position?.[1] ?? 0;
  const passed = fallCheckPassed(engine.stats(), (model.bodies[0].origin[1] + lift) / 1000);

  engine.dispose();

  return passed;
}

describe('driving legs', () => {
  it('a hexapod walks forward, strafes and turns on command', async () => {
    const mj = await loadMujoco();
    const { model, access } = walker('hexapod');

    expect(access.kind).toBe('ready');

    if (access.kind !== 'ready') return;

    const run = (v: [number, number, number], seconds: number) => {
      const engine = new SimEngine(mj, model);

      engine.setController({ kind: 'drive', setup: access.setup });
      engine.step(1);
      engine.command({ v });

      return { engine, yaw: yawChange(engine, seconds) };
    };
    const forward = run([1, 0, 0], 5);
    const stats = forward.engine.stats().robots[0];

    expect(stats.forward).toBeGreaterThan(0.4);
    expect(stats.fellAt).toBeNull();
    expect(stats.tilt).toBeLessThan(10);
    forward.engine.dispose();

    const left = run([0, 0, 1], 1);
    const right = run([0, 0, -1], 1);

    expect(left.yaw).toBeGreaterThan(0.05);
    expect(right.yaw).toBeLessThan(-0.05);
    left.engine.dispose();
    right.engine.dispose();

    const strafe = run([0, 1, 0], 4);

    expect(strafe.engine.poses()[0]).toBeGreaterThan(0.1);
    strafe.engine.dispose();
  });

  it('the fall check unlocks walkers that stay up and locks those that do not', async () => {
    const mj = await loadMujoco();

    expect(fallCheck(mj, 'hexapod')).toBe(true);
    expect(fallCheck(mj, 'quad-servo')).toBe(true);
    expect(fallCheck(mj, 'quad-big')).toBe(true);
    expect(fallCheck(mj, 'must-fail-weak-quad')).toBe(false);
  });

  it('offers to teach a biped to walk, and never gives it a scripted drive', () => {
    expect(walker('biped-servo').access).toEqual({ kind: 'teach' });
    expect(walker('wheel-legged').access).toEqual({ kind: 'teach' });
    expect(offer('biped-servo')).toBe('teach');
    expect(offer('wheel-legged')).toBe('teach');
  });

  it('drives any walker through its ready velocity skill, before a scripted gait', () => {
    for (const id of ['biped-servo', 'quad-servo']) {
      const { access } = walker(id, stubVelocity);

      expect(access.kind).toBe('policy');
      expect(access.kind === 'policy' && access.cls).toBe('legs');
      expect(offer(id, true)).toBe('drive');
      expect(withVelocity(offer(id), true)).toBe('drive');
    }

    expect(withVelocity('none', true)).toBe('none');
  });

  it('offers Drive to robots with a scripted drive and nothing to a robot that can’t move', () => {
    expect(offer('hexapod')).toBe('drive');
    expect(offer('rover-diff')).toBe('drive');
    expect(offer('arm-6dof')).toBe('drive');
    expect(driveOffer({ rig: buildRig([], []), parts: [], velocityReady: true })).toBe('none');
  });

  it('turns keys into a velocity command inside what the walk was trained on', () => {
    expect(policyCommand({ v: [1, 1, -1] }, 0.2).v).toEqual([0.2, 0.05, -0.6]);
    expect(policyCommand({ v: [-1, 0, 0] }, 0.2).v[0]).toBe(0);
  });

  it('alternating phases split six feet into two tripods', () => {
    const r = robot('hexapod');
    const phases = alternatingPhases(footPoints(buildRig(r.joints, r.parts), r.parts).map((f) => f.point));

    expect(phases.filter((p) => p === 0)).toHaveLength(3);
    expect(phases.filter((p) => p === 0.5)).toHaveLength(3);
    expect(phases[0]).not.toBe(phases[1]);
    expect(phases[0]).not.toBe(phases[2]);
  });
});

describe('respawn', () => {
  it('puts a fallen robot back and clears the fall, leaving the world alone', async () => {
    const mj = await loadMujoco();
    const r = robot('hexapod');
    const rig = buildRig(r.joints, r.parts);
    const ball: WorldItem = {
      ...box('ball', [300, 40, 0], [80, 80, 80], 200),
      kind: 'sphere',
      behavior: 'dynamic',
    };
    const model = buildMjcf({ ...caseRobot(r), rig, project: DEFAULT_PROJECT, world: [ball] });
    const engine = new SimEngine(mj, model);
    const ballIndex = model.bodies.findIndex((b) => b.world?.includes('ball'));

    engine.setController({ kind: 'limp' });
    engine.data.qpos[2] = 0.02;
    engine.step(0.05);
    expect(engine.stats().robots[0].fellAt).not.toBeNull();

    const ballBefore = engine.poses()[ballIndex * 7];

    engine.setController({ kind: 'hold' });
    engine.respawn();

    const stats = engine.stats().robots[0];

    expect(stats.fellAt).toBeNull();
    expect(stats.tilt).toBeLessThan(1);
    expect(Math.abs(stats.height)).toBeLessThan(0.002);
    expect(engine.poses()[ballIndex * 7]).toBeCloseTo(ballBefore, 5);
    engine.dispose();
  });
});

describe('driving an arm', () => {
  it('moves the end effector with velocity commands and holds when idle', async () => {
    const mj = await loadMujoco();
    const { rig, model, access, r } = walker('arm-6dof');

    expect(access.kind === 'ready' && access.cls).toBe('arm');

    if (access.kind !== 'ready') return;

    const facts = robotFacts(rig, r.parts);
    const engine = new SimEngine(mj, model);
    const tip = () => {
      const delta = simDeltas(model, engine.poses()).get(facts.endEffector!.part)!;

      return new THREE.Vector3(...facts.endEffector!.point).applyMatrix4(delta);
    };

    engine.setController({ kind: 'drive', setup: access.setup });
    engine.step(0.5);

    const start = tip();

    engine.command({ v: [1, 0, 0] });
    engine.step(0.6);
    engine.command({ v: [0, 0, 0] });
    engine.step(0.5);

    const moved = tip();

    expect(moved.z - start.z).toBeGreaterThan(60);
    engine.step(0.5);
    expect(tip().distanceTo(moved)).toBeLessThan(5);
    engine.dispose();
  });

  it('stops the hand where it is on release, and reports it in the stats', async () => {
    const mj = await loadMujoco();
    const { model, access } = walker('arm-6dof');

    if (access.kind !== 'ready') throw new Error('arm-6dof should drive');

    const engine = new SimEngine(mj, model);
    const hand = () => new THREE.Vector3(...engine.stats().effector!);

    engine.setController({ kind: 'drive', setup: access.setup });
    engine.step(0.5);
    engine.command({ v: [1, 0, 0] });
    engine.step(1.5);

    const released = hand();

    engine.command({ v: [0, 0, 0] });
    engine.step(1);
    expect(hand().distanceTo(released)).toBeLessThan(5);
    engine.dispose();
  });
});

describe('drive keys', () => {
  it('map per class', () => {
    expect(commandFromKeys(new Set(['w']), 'rover').v).toEqual([1, 0, 0]);
    expect(commandFromKeys(new Set(['a']), 'rover').v).toEqual([0, 0, 1]);
    expect(commandFromKeys(new Set(['a', 'd']), 'rover').v).toEqual([0, 0, 0]);
    expect(commandFromKeys(new Set(['q']), 'legs').v).toEqual([0, 1, 0]);
    expect(commandFromKeys(new Set(['d']), 'legs').v).toEqual([0, 0, -1]);
    expect(commandFromKeys(new Set(['a']), 'arm').v).toEqual([0, 1, 0]);
    expect(commandFromKeys(new Set(['q']), 'arm').aux?.[0]).toBe(1);
  });

  it('a pad inside its deadzone never overrides the keys', () => {
    const keys = commandFromKeys(new Set(['w']), 'legs');
    const rest = commandFromPad({ axes: [0.05, -0.1, 0, 0], buttons: [] }, 'legs');
    const pushed = commandFromPad({ axes: [0, -1, 0, 0], buttons: [] }, 'legs');

    expect(mergeCommands(keys, rest)).toBe(keys);
    expect(mergeCommands(keys, pushed).v[0]).toBe(1);
  });

  it('counts a new arm target as a new command', () => {
    const still: [number, number, number] = [0, 0, 0];

    expect(sameCommand({ v: still, target: [0, 40, 120] }, { v: still, target: [0, 40, 400] })).toBe(false);
    expect(sameCommand({ v: still, target: [0, 40, 120] }, { v: still, target: [0, 40, 120] })).toBe(true);
    expect(sameCommand({ v: still }, { v: still, target: [0, 40, 120] })).toBe(false);
  });
});
