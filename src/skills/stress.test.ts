import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { readyStand } from './hubSkillFixtures';
import { kitEnvironment } from './kitEnvironment';
import { MIN_STRESS_BUDGET, STRESS_BUDGET, STRESS_LIMITS, stressSkill, type StressRun } from './stress';
import { findingLine } from './stressWords';

const model = fixtureModel('hexapod');
const environment = kitEnvironment(model, 'stand');
const skill = readyStand(model, 'hexapod');
let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const planted = (margin: (run: StressRun) => number) => {
  const runs: StressRun[] = [];
  const probe = (run: StressRun) => {
    runs.push(run);

    return Promise.resolve(margin(run));
  };

  return { runs, probe };
};

const stress = (probe: (run: StressRun) => Promise<number>, options: { budget?: number; seed?: string } = {}) =>
  stressSkill({ mj, model, skill, environment, probe, ...options });

describe('stressSkill', () => {
  it.each([
    { axis: 'mass', at: 1.3, side: 'above', margin: (r: StressRun) => (1.3 - r.mass) * 2, tolerance: 0.05 },
    { axis: 'latencyMs', at: 60, side: 'above', margin: (r: StressRun) => (60 - r.latencyMs) / 60, tolerance: 5 },
    { axis: 'friction', at: 0.55, side: 'below', margin: (r: StressRun) => (r.friction - 0.55) * 3, tolerance: 0.05 },
  ] as const)(
    'finds a planted $axis boundary $side $at within the budget',
    async ({ axis, at, side, margin, tolerance }) => {
      const { runs, probe } = planted(margin);
      const result = await stress(probe);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({ axis, side });
      expect(Math.abs(result.findings[0].boundary! - at)).toBeLessThan(tolerance);
      expect(result.findings[0].margin).toBeLessThan(0);
      expect(runs).toHaveLength(result.rollouts);
      expect(result.rollouts).toBeLessThanOrEqual(STRESS_BUDGET);
    },
  );

  it('returns no findings for a skill that passes everywhere in the limits', async () => {
    const result = await stress(planted(() => 0.8).probe);

    expect(result.findings).toEqual([]);
    expect(result.axes.map((a) => a.boundary)).toEqual([null, null, null, null]);
    expect(result.worst.margin).toBeCloseTo(0.8, 9);
  });

  it('finds two weak axes together worse than either alone', async () => {
    const weak = (share: number) => Math.max(0, Math.min(1, share));
    const { probe } = planted((r) => 1 - 0.7 * weak((1 - r.friction) / 0.8) - 0.7 * weak(r.mass - 1));
    const result = await stress(probe);
    const alone = Math.min(...result.axes.map((a) => a.margin));

    expect(alone).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
    expect(result.worst.margin).toBeLessThan(0);
    expect(result.worst.margin).toBeLessThan(alone);
  });

  it('gives the same findings for the same seed, and stays inside the limits', async () => {
    const margin = (r: StressRun) => Math.min(r.strength - 0.7, (90 - r.latencyMs) / 90);
    const first = await stress(planted(margin).probe, { seed: 'a'.repeat(64) });
    const again = await stress(planted(margin).probe, { seed: 'a'.repeat(64) });

    expect(again).toEqual(first);
    expect(first.findings.map((f) => f.axis)).toEqual(['strength', 'latencyMs']);
    expect(first.findings.map(findingLine)[0]).toMatch(/^Servo strength < \d+%, margin −0\.\d\d$/);

    for (const finding of first.axes)
      expect(finding.run[finding.axis]).toBeGreaterThanOrEqual(STRESS_LIMITS[finding.axis][0]);
  });

  it.each([MIN_STRESS_BUDGET, 23, STRESS_BUDGET, 100, 250])('never runs more than a budget of %i', async (budget) => {
    const { runs, probe } = planted((r) => r.friction - 0.9 + (1.2 - r.mass) + (r.strength - 0.6));
    const result = await stress(probe, { budget });

    expect(runs.length).toBeLessThanOrEqual(budget);
    expect(result.rollouts).toBe(runs.length);
  });
});
