import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import walk from '../routines/kit/quad-servo-velocity-tracking.skill.json';
import { ARENA } from './arena';
import type { Skill } from './artifacts';
import { fixtureModel } from './fixtureModels';
import { kitEnvironment } from './kitEnvironment';
import { rolloutJudge, stressSkill, stressStart, type StressJudge, type StressPoint } from './stress';
import { findingLine } from './stressWords';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const WALK = walk as unknown as Skill;
const HOLD = { ...WALK, controller: { kind: 'hold' } } as Skill;
const quad = fixtureModel('quad-servo');

const planted = (judge: (p: StressPoint) => number) => {
  const calls: StressPoint[] = [];
  const counted: StressJudge = (p) => {
    calls.push(p);

    return Promise.resolve(judge(p));
  };

  return { judge: counted, calls };
};

const stressed = (judge: StressJudge, options: { budget?: number; seed?: string } = {}) =>
  stressSkill({
    mj,
    model: quad,
    skill: HOLD,
    environment: kitEnvironment(quad, 'stand'),
    judge,
    seed: options.seed ?? 'test',
    budget: options.budget,
  });

const axisOf = (result: Awaited<ReturnType<typeof stressed>>, axis: string) =>
  result.axes.find((a) => a.axis === axis)!;

describe('stressSkill on planted controllers', () => {
  it('finds a mass failure at ×1.3 and up to within 0.05, inside the budget', async () => {
    const { judge, calls } = planted((p) => 1.3 - p.mass);
    const result = await stressed(judge);
    const mass = axisOf(result, 'mass');

    expect(mass.side).toBe('above');
    expect(Math.abs(mass.boundary! - 1.3)).toBeLessThan(0.05);
    expect(result.findings[0]).toMatchObject({ axis: 'mass', side: 'above' });
    expect(findingLine(result.findings[0])).toMatch(/^Mass > ×1\.[23]\d?$/);
    expect(calls.length).toBeLessThanOrEqual(result.budget);
  });

  it('finds a latency failure above 60 ms on the delay axis', async () => {
    const { judge } = planted((p) => (60 - p.latencyMs) / 60);
    const latency = axisOf(await stressed(judge), 'latencyMs');

    expect(latency.side).toBe('above');
    expect(Math.abs(latency.boundary! - 60)).toBeLessThan(150 * 0.02);
  });

  it('returns no findings for a controller that passes everywhere inside the limits', async () => {
    const { judge } = planted(() => 0.4);
    const result = await stressed(judge);

    expect(result.findings).toEqual([]);
    expect(result.axes.every((a) => a.boundary === null)).toBe(true);
  });

  it('finds a combination worse than either weak axis alone', async () => {
    const { judge } = planted((p) => 1 - 1.4 * (1 - p.strength) - p.latencyMs / 120);
    const result = await stressed(judge);
    const alone = Math.min(axisOf(result, 'strength').worst.margin, axisOf(result, 'latencyMs').worst.margin);

    expect(result.worst.margin).toBeLessThan(alone);
    expect(result.worst.point.strength).toBeLessThan(1);
    expect(result.worst.point.latencyMs).toBeGreaterThan(0);
    expect(result.findings[0].axis).toBe('combined');
  });

  it('gives the same findings for the same seed', async () => {
    const plant = (p: StressPoint) => Math.min(p.friction - 0.55, 1.6 - p.mass);
    const [a, b] = [await stressed(planted(plant).judge), await stressed(planted(plant).judge)];

    expect(b.findings).toEqual(a.findings);
    expect(b.worst).toEqual(a.worst);
  });

  it('never runs more rollouts than its budget', async () => {
    for (const budget of [16, 40, 120]) {
      const { judge, calls } = planted((p) => Math.min(p.friction - 0.5, p.strength - 0.7));
      const result = await stressed(judge, { budget });

      expect(calls.length).toBeLessThanOrEqual(budget);
      expect(result.rollouts).toBe(calls.length);
    }
  });
});

describe('stressSkill on real physics', () => {
  it('breaks the committed quad-servo Walk at the low end of strength', async () => {
    const environment = kitEnvironment(quad, 'velocity-tracking');
    const result = await stressSkill({ mj, model: quad, skill: WALK, environment, seed: 'a', budget: 32 });
    const strength = axisOf(result, 'strength');

    expect(strength.side).toBe('below');
    expect(strength.boundary).toBeGreaterThan(0.6);
    expect(strength.boundary).toBeLessThan(0.9);
    expect(result.findings.some((f) => f.axis === 'strength')).toBe(true);
  }, 60_000);

  it('holds Stand on quad-servo everywhere inside the limits', async () => {
    const environment = kitEnvironment(quad, 'stand');
    const result = await stressSkill({ mj, model: quad, skill: HOLD, environment, seed: 'a', budget: 24 });

    expect(result.nominal.margin).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  }, 60_000);

  it('finds a planted friction failure on the hexapod while every rollout runs the real sim', async () => {
    const model = fixtureModel('hexapod');
    const environment = kitEnvironment(model, 'stand');
    const start = stressStart(model, environment, 'hex');
    const real = rolloutJudge({ mj, model, controller: { kind: 'hold' }, environment, start });
    const judge: StressJudge = async (p) => {
      const margin = await real.judge(p);

      return p.friction < 0.45 ? Math.min(margin, -0.5) : margin;
    };

    try {
      const result = await stressSkill({ mj, model, skill: HOLD, environment, seed: 'hex', budget: 60, judge });
      const friction = axisOf(result, 'friction');

      expect(friction.side).toBe('below');
      expect(friction.boundary).toBeLessThan(0.45 + 0.03);
      expect(friction.boundary).toBeGreaterThan(0.45 - 0.03);
    } finally {
      real.dispose();
    }
  }, 60_000);

  it('leaves Arena’s frozen constants and a skill’s stored evidence byte for byte', async () => {
    const before = [JSON.stringify(ARENA), JSON.stringify(WALK.evidence), JSON.stringify(WALK)];
    const environment = kitEnvironment(quad, 'velocity-tracking');

    await stressSkill({ mj, model: quad, skill: WALK, environment, seed: 'b', budget: 16 });

    expect([JSON.stringify(ARENA), JSON.stringify(WALK.evidence), JSON.stringify(WALK)]).toEqual(before);
    expect(Object.isFrozen(ARENA.floor)).toBe(true);
  }, 60_000);
});
