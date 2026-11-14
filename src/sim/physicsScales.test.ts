import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { ArenaWorld, type Instance } from '../skills/arenaWorld';
import { fixtureModel } from '../skills/fixtureModels';
import { SimEngine } from './engine';
import { latencySteps, type PhysicsScales } from './physicsScales';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const FIELDS = ['geom_friction', 'body_mass', 'body_inertia', 'actuator_forcerange'] as const;

const snapshot = (engine: SimEngine) =>
  Object.fromEntries(FIELDS.map((f) => [f, Array.from(engine.model[f] as ArrayLike<number>)]));

const scales: PhysicsScales = { friction: 0.4, mass: 1.7, strength: 0.6, latencyMs: 30 };

const instanceOf = (s: PhysicsScales): Instance => ({
  friction: s.friction,
  masses: [s.mass],
  strength: s.strength,
  latencyMs: s.latencyMs,
  jointNoise: [],
  yawDeg: 0,
  offsetMm: [0, 0],
});

function ctrlTrace(engine: SimEngine, joint: string) {
  const trace: number[][] = [];
  const note = () => trace.push(Array.from(engine.data.ctrl));

  engine.setController({ kind: 'hold', values: { [joint]: 20 } });
  engine.step(0.1, note);
  engine.setController({ kind: 'hold', values: { [joint]: -20 } });
  engine.step(0.1, note);

  return trace;
}

describe('scaled physics', () => {
  it('scales friction, mass, inertia and force range, keeps the pose, and null restores every byte', () => {
    const engine = new SimEngine(mj, fixtureModel('quad-servo'));

    engine.step(0.2);

    const before = snapshot(engine);
    const qpos = Array.from(engine.data.qpos);

    engine.setPhysics(scales);

    const scaled = snapshot(engine);

    expect(Array.from(engine.data.qpos)).toEqual(qpos);
    expect(scaled.geom_friction[0]).toBe(before.geom_friction[0] * scales.friction);
    expect(scaled.geom_friction[1]).toBe(before.geom_friction[1]);
    expect(scaled.body_mass[0]).toBe(before.body_mass[0]);
    expect(scaled.body_mass.slice(1)).toEqual(before.body_mass.slice(1).map((m) => m * scales.mass));
    expect(scaled.body_inertia.slice(3)).toEqual(before.body_inertia.slice(3).map((m) => m * scales.mass));
    expect(scaled.actuator_forcerange).toEqual(before.actuator_forcerange.map((f) => f * scales.strength));
    engine.reset();
    engine.respawn();
    expect(snapshot(engine)).toEqual(scaled);
    engine.setPhysics(null);
    expect(snapshot(engine)).toEqual(before);
    engine.dispose();
  });

  it('holds each control back by the latency in physics steps, from the first control', () => {
    const live = new SimEngine(mj, fixtureModel('arm-3dof'));
    const nominal = new SimEngine(mj, fixtureModel('arm-3dof'));
    const joint = live.sim.joints[1].id;
    const steps = latencySteps(scales.latencyMs, live.dt);

    live.setPhysics({ friction: 1, mass: 1, strength: 1, latencyMs: scales.latencyMs });
    live.step(0.5);
    live.reset();

    const late = ctrlTrace(live, joint);
    const sent = ctrlTrace(nominal, joint);

    expect(steps).toBeGreaterThan(5);
    expect(sent.slice(0, -steps).some((c, n) => c[1] !== sent[n + steps][1])).toBe(true);
    late.forEach((c, n) => expect(c).toEqual(sent[Math.max(0, n - steps)]));
    [live, nominal].forEach((e) => e.dispose());
  });

  it('runs exactly as Arena runs the same instance', () => {
    const live = new SimEngine(mj, fixtureModel('quad-servo'));
    const arena = new ArenaWorld(mj, fixtureModel('quad-servo'));
    const robot = live.sim.robots[0].key;
    const joint = live.sim.joints[1].id;
    const start = live.sim.initial;

    live.setPhysics(scales);
    live.setController({ kind: 'hold' });
    live.reset(start);
    arena.prepare({ instance: instanceOf(scales), controller: { kind: 'hold' }, start, robot });
    expect(snapshot(live)).toEqual(snapshot(arena.engine));
    expect(ctrlTrace(live, joint)).toEqual(ctrlTrace(arena.engine, joint));
    expect(Array.from(live.data.qpos)).toEqual(Array.from(arena.engine.data.qpos));
    live.dispose();
    arena.dispose();
  });

  it('restores the force range whether a fault comes before or after the strength scale', () => {
    const engine = new SimEngine(mj, fixtureModel('quad-servo'));
    const before = snapshot(engine).actuator_forcerange;
    const knee = engine.sim.joints.find((j) => j.id === 'leg0_bend')!.actuator;
    const range = () => snapshot(engine).actuator_forcerange;

    engine.setFault('leg0_bend', 'weak');
    engine.setPhysics(scales);
    expect(range()[knee * 2 + 1]).toBe(before[knee * 2 + 1] * (0.5 * scales.strength));
    expect(range()[(knee + 1) * 2 + 1]).toBe(before[(knee + 1) * 2 + 1] * scales.strength);
    engine.setPhysics(null);
    expect(range()[knee * 2 + 1]).toBe(before[knee * 2 + 1] * 0.5);
    engine.setFault('leg0_bend', null);
    expect(range()).toEqual(before);

    engine.setPhysics(scales);
    engine.setFault('leg0_bend', 'limp');
    engine.setController({ kind: 'limp' });
    engine.setController({ kind: 'hold' });
    expect(range()[knee * 2 + 1]).toBe(0);
    engine.setFault('leg0_bend', null);
    expect(range()).toEqual(before.map((f) => f * scales.strength));
    engine.setPhysics(null);
    expect(range()).toEqual(before);
    engine.dispose();
  });
});
