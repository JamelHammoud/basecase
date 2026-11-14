import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { SimEngine } from './engine';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const FIELDS = ['geom_friction', 'body_mass', 'body_inertia', 'actuator_forcerange'] as const;

const snapshot = (engine: SimEngine) =>
  Object.fromEntries(FIELDS.map((f) => [f, Array.from(engine.model[f] as ArrayLike<number>)]));

describe('live sim conditions', () => {
  it('scales friction, every body’s mass and inertia and every servo’s torque, and null restores the model exactly', () => {
    const engine = new SimEngine(mj, fixtureModel('quad-servo'));
    const before = snapshot(engine);

    engine.conditions.apply({ friction: 0.4, mass: 1.5, strength: 0.6, latencyMs: 0 });

    const scaled = snapshot(engine);

    expect(scaled.geom_friction[0]).toBeCloseTo(before.geom_friction[0] * 0.4);
    expect(scaled.geom_friction[1]).toBe(before.geom_friction[1]);
    expect(scaled.body_mass[0]).toBe(before.body_mass[0]);
    expect(scaled.body_mass[1]).toBeCloseTo(before.body_mass[1] * 1.5);
    expect(scaled.body_inertia[3]).toBeCloseTo(before.body_inertia[3] * 1.5);
    expect(scaled.actuator_forcerange[1]).toBeCloseTo(before.actuator_forcerange[1] * 0.6);
    expect(engine.stats().conditions).toEqual({ friction: 0.4, mass: 1.5, strength: 0.6, latencyMs: 0 });

    engine.conditions.apply({ friction: 1.2, mass: 0.5, strength: 1, latencyMs: 0 });
    expect(engine.stats().conditions).toMatchObject({ friction: 1.2, mass: 0.5 });

    engine.reset();
    expect(engine.stats().conditions).toMatchObject({ friction: 1.2, mass: 0.5 });

    engine.conditions.clear();
    expect(snapshot(engine)).toEqual(before);
    expect(engine.stats().conditions).toBeNull();

    engine.conditions.apply({ friction: 1.2, mass: 0.5, strength: 1, latencyMs: 0 });

    engine.conditions.apply(null);
    expect(snapshot(engine)).toEqual(before);
    expect(engine.stats().conditions).toBeNull();
    engine.dispose();
  });

  it('composes with a servo fault, so clearing either one leaves the other as it was', () => {
    const engine = new SimEngine(mj, fixtureModel('quad-servo'));
    const before = snapshot(engine);
    const joint = engine.sim.joints.find((j) => j.actuator >= 0)!;
    const [low, high] = [joint.actuator * 2, joint.actuator * 2 + 1];
    const range = () => engine.model.actuator_forcerange;

    engine.setFault(joint.id, 'weak');
    engine.conditions.apply({ friction: 1, mass: 1, strength: 0.8, latencyMs: 0 });
    expect(range()[high]).toBeCloseTo(before.actuator_forcerange[high] * 0.4);
    expect(engine.stats().conditions?.strength).toBeCloseTo(0.8);

    engine.conditions.apply(null);
    expect(range()[high]).toBeCloseTo(before.actuator_forcerange[high] * 0.5);

    engine.conditions.apply({ friction: 1, mass: 1, strength: 0.8, latencyMs: 0 });
    engine.setFault(joint.id, null);
    expect(range()[low]).toBeCloseTo(before.actuator_forcerange[low] * 0.8);

    engine.conditions.apply(null);
    expect(snapshot(engine)).toEqual(before);
    engine.dispose();
  });

  it('feeds each control the value commanded the delay’s steps earlier', () => {
    const engine = new SimEngine(mj, fixtureModel('quad-servo'));
    const steps = 5;

    engine.conditions.apply({ friction: 1, mass: 1, strength: 1, latencyMs: steps * engine.dt * 1000 });

    const ctrl = engine.data.ctrl;
    const seen: number[] = [];

    for (let t = 1; t <= 12; t++) {
      ctrl.fill(t);
      engine.conditions.delay(ctrl);
      seen.push(ctrl[0]);
    }

    expect(seen).toEqual([1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7]);
    expect(engine.stats().conditions?.latencyMs).toBeCloseTo(steps * engine.dt * 1000);
    engine.dispose();
  });
});
