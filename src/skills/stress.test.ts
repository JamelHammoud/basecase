import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { NOMINAL_PHYSICS, type PhysicsScales } from '../sim/physicsScales';
import { ARENA, runArena } from './arena';
import { fixtureModel } from './fixtureModels';
import { kitEnvironment } from './kitEnvironment';
import { offsetPose } from './kitModel';
import { STRESS_BUDGET, stressSkill, type StressAxis, type StressResult } from './stress';
import { STRESS_STARTS } from './stressBench';
import {
  plantContract,
  plantedValue,
  plantEnvironment,
  rampAnimation,
  shuffleAnimation,
  type Extreme,
  type Plant,
} from './stressFixtures';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const at = (change: Partial<PhysicsScales>): PhysicsScales => ({ ...NOMINAL_PHYSICS, ...change });

async function planted(plant: Plant, options: { point: PhysicsScales; pick: Extreme }) {
  const bar = await plantedValue(mj, plant, options);

  return plantEnvironment(plant, plantContract(plant, { bar, pick: options.pick }));
}

const moved = (point: PhysicsScales) =>
  (Object.keys(point) as StressAxis[]).filter((axis) => Math.abs(point[axis] - NOMINAL_PHYSICS[axis]) > 1e-3);

const axisOf = (result: StressResult, axis: StressAxis) => result.axes.find((a) => a.axis === axis)!;

function crouchPlant(id: string, degrees: number, signal: Plant['signal']): Plant {
  const model = fixtureModel(id);
  const start = offsetPose(model, degrees);

  return {
    model,
    controller: { kind: 'hold', values: start.values },
    start,
    signal,
    horizonS: 2,
    window: { from: 1, to: 2 },
  };
}

function armPlant(): Plant {
  const model = fixtureModel('arm-3dof');
  const animation = rampAnimation('arm1', 60);

  return {
    model,
    controller: { kind: 'animation', animation },
    start: { ...model.initial, values: animation.keyframes[0].values },
    signal: { kind: 'joint-position', joint: 'arm1' },
    horizonS: 1.2,
    window: { from: 1, to: 1.1 },
  };
}

function shufflePlant(): Plant {
  const model = fixtureModel('hexapod');
  const animation = shuffleAnimation(model, 30);

  return {
    model,
    controller: { kind: 'animation', animation },
    start: { ...model.initial, values: animation.keyframes[0].values },
    signal: { kind: 'base-forward' },
    horizonS: 4,
    window: { from: 0.02, to: 4 },
  };
}

async function stressPlant(plant: Plant, options: { point: PhysicsScales; pick: Extreme; budget?: number }) {
  const environment = await planted(plant, options);
  const { model, controller } = plant;

  return stressSkill({ mj, model, skill: { controller }, environment, budget: options.budget, seed: 'cases' });
}

describe('stressSkill', () => {
  it('finds a planted mass failure at ×1.3 within 0.05, inside the default budget', async () => {
    const plant = crouchPlant('quad-servo', 20, { kind: 'joint-effort', joint: 'leg0_bend' });
    const result = await stressPlant(plant, { point: at({ mass: 1.3 }), pick: 'max' });
    const mass = axisOf(result, 'mass');

    expect(mass.side).toBe('above');
    expect(mass.boundary).toBeGreaterThan(1.25);
    expect(mass.boundary).toBeLessThan(1.35);
    expect(result.findings.some((f) => f.axis === 'mass')).toBe(true);
    expect(result.rollouts).toBeLessThanOrEqual(STRESS_BUDGET);
  }, 60000);

  it('finds a weak servo’s crouch failing at the low end of strength', async () => {
    const plant = crouchPlant('must-fail-weak-quad', 30, { kind: 'base-height' });
    const result = await stressPlant(plant, { point: at({ strength: 0.43 }), pick: 'min', budget: 80 });
    const strength = axisOf(result, 'strength');

    expect(strength.side).toBe('below');
    expect(strength.boundary).toBeGreaterThan(0.4);
    expect(strength.boundary).toBeLessThan(0.46);
  }, 60000);

  it('finds a planted latency failure above 60 ms on the latency axis', async () => {
    const result = await stressPlant(armPlant(), { point: at({ latencyMs: 60 }), pick: 'min', budget: 80 });
    const latency = axisOf(result, 'latencyMs');

    expect(latency.side).toBe('above');
    expect(latency.boundary).toBeGreaterThan(54);
    expect(latency.boundary).toBeLessThan(66);
  }, 60000);

  it('finds the hexapod sliding further than planted below a friction of 0.6', async () => {
    const result = await stressPlant(shufflePlant(), { point: at({ friction: 0.6 }), pick: 'max', budget: 60 });
    const friction = axisOf(result, 'friction');

    expect(friction.side).toBe('below');
    expect(friction.boundary).toBeGreaterThan(0.55);
    expect(friction.boundary).toBeLessThan(0.65);
  }, 90000);

  it('returns no findings for the hold controller on quad-servo’s Stand, which holds across the limits', async () => {
    const model = fixtureModel('quad-servo');
    const environment = kitEnvironment(model, 'stand');
    const result = await stressSkill({ mj, model, skill: { controller: { kind: 'hold' } }, environment, budget: 48 });

    expect(result.findings).toEqual([]);
    expect(result.axes.map((a) => a.boundary)).toEqual([null, null, null, null]);
  }, 60000);

  it('finds a combination of two weak axes worse than either alone', async () => {
    const result = await stressPlant(armPlant(), {
      point: at({ latencyMs: 100, mass: 1.5 }),
      pick: 'min',
      budget: 120,
    });
    const alone = Math.min(...result.axes.map((a) => a.worst.margin));

    expect(result.worst.margin).toBeLessThan(alone);
    expect(moved(result.worst.point).length).toBeGreaterThan(1);
    expect(result.findings[0].axis).toBe('combined');
  }, 60000);

  it('gives the same findings and trace for the same seed', async () => {
    const environment = await planted(armPlant(), { point: at({ latencyMs: 60 }), pick: 'min' });
    const { model, controller } = armPlant();
    const run = () => stressSkill({ mj, model, skill: { controller }, environment, budget: 40, seed: 'same' });
    const [first, second] = [await run(), await run()];

    expect(second.findings).toEqual(first.findings);
    expect(second.trace).toEqual(first.trace);
  }, 60000);

  it('leaves Arena’s frozen constants and stored evidence byte-identical', async () => {
    const plant = armPlant();
    const environment = await planted(plant, { point: at({ latencyMs: 60 }), pick: 'min' });
    const input = { mj, model: plant.model, contract: environment.contract, controller: plant.controller, environment };
    const salt = new Uint8Array(32).fill(3);
    const frozen = JSON.stringify(ARENA);
    const evidence = await runArena({ ...input, salt });
    const stored = JSON.stringify(evidence);

    await stressSkill({ mj, model: plant.model, skill: { controller: plant.controller }, environment, budget: 40 });

    expect(JSON.stringify(ARENA)).toBe(frozen);
    expect(JSON.stringify(evidence)).toBe(stored);
    expect(JSON.stringify(await runArena({ ...input, salt }))).toBe(stored);
  }, 60000);

  it('never runs more rollouts than its budget', async () => {
    const plant = armPlant();
    const environment = await planted(plant, { point: at({ latencyMs: 60 }), pick: 'min' });

    for (const budget of [24, 37, 61]) {
      const result = await stressSkill({
        mj,
        model: plant.model,
        skill: { controller: plant.controller },
        environment,
        budget,
      });

      expect(result.rollouts).toBeLessThanOrEqual(budget);
      expect(result.trace.length * STRESS_STARTS).toBe(result.rollouts);
    }
  }, 60000);
});
