import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SimModel } from '../sim/mjcfTypes';
import { ARENA } from './arena';
import { drawInstance, seededRandom, trialSeed } from './arenaWorld';
import { currentDesign, skillFromTraining, type Skill } from './artifacts';
import type { Environment } from './environment';
import { fixtureModel } from './fixtureModels';
import { canonicalJson } from './hash';
import { kitEnvironment } from './kitEnvironment';
import { kitRobot } from './kitModel';
import { designOf } from './skillsRuntime';
import { physicsJudge, stressStart } from './stressJudge';
import { STRESS_LIMITS, stressSearch, stressSkill, type StressJudge, type StressPoint } from './stress';
import { standingPolicy } from './stressFixtures';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function standSkill(model: SimModel, stiffness = 0): { skill: Skill; environment: Environment } {
  const environment = kitEnvironment(model, 'stand');
  const current = currentDesign({ design: designOf(model), model, environment });
  const controller = {
    kind: 'policy' as const,
    policy: standingPolicy(model, { stiffness }),
    robot: kitRobot(model).key,
  };

  return { skill: skillFromTraining({ name: 'Stand', start: null, current, environment, controller }), environment };
}

const planted =
  (margin: (p: StressPoint) => number): StressJudge =>
  async (p) =>
    margin(p);

const counted = (judge: StressJudge) => {
  const calls: StressPoint[] = [];

  return {
    calls,
    judge: async (p: StressPoint) => {
      calls.push(p);

      return judge(p);
    },
  };
};

describe('stress search, planted', () => {
  it('finds a planted heavy-load failure at ×1.3 to within 0.05, inside the budget', async () => {
    const { judge, calls } = counted(planted((p) => 1.3 - p.mass - 1e-6));
    const result = await stressSearch({ judge, seed: 'a', budget: 96 });
    const finding = result.findings.find((f) => f.axis === 'mass')!;

    expect(finding.side).toBe('above');
    expect(Math.abs(finding.boundary - 1.3)).toBeLessThan(0.05);
    expect(calls.length).toBeLessThanOrEqual(96);
    expect(result.rollouts).toBe(calls.length);
  });

  it('finds a planted latency failure above 60 ms on the latency axis', async () => {
    const result = await stressSearch({ judge: planted((p) => (60 - p.latencyMs) / 60), seed: 'b', budget: 48 });

    expect(result.findings.map((f) => f.axis)).toEqual(['latencyMs']);
    expect(Math.abs(result.findings[0].boundary - 60)).toBeLessThan(5);
  });

  it('returns no findings for a controller that passes everywhere in the limits', async () => {
    const result = await stressSearch({ judge: planted((p) => 1 + 0.1 * p.mass), seed: 'c', budget: 32 });

    expect(result.findings).toEqual([]);
    expect(result.worst.margin).toBeGreaterThan(0);
  });

  it('finds a combination of two weak axes worse than either alone', async () => {
    const weakness = (p: StressPoint) => (p.mass - 1) / 1 + p.latencyMs / 150;
    const result = await stressSearch({ judge: planted((p) => 1 - 0.6 * weakness(p)), seed: 'd', budget: 64 });
    const alone = Math.min(...result.axes.map((a) => a.margin));

    expect(result.findings).toEqual([]);
    expect(alone).toBeGreaterThan(0);
    expect(result.worst.margin).toBeLessThan(0);
    expect(result.worst.replay.mass).toBeGreaterThan(1.5);
    expect(result.worst.replay.latencyMs).toBeGreaterThan(100);
  });

  it('gives the same findings for the same seed', async () => {
    const bumpy = planted((p) => Math.sin(4 * p.friction) + 0.4 - (p.strength < 0.6 ? 1 : 0));
    const first = await stressSearch({ judge: bumpy, seed: 'same', budget: 40 });
    const second = await stressSearch({ judge: bumpy, seed: 'same', budget: 40 });

    expect(canonicalJson(second)).toBe(canonicalJson(first));
    expect(first.findings.length).toBeGreaterThan(0);
  });

  it('never rolls out more than its budget', async () => {
    for (const budget of [16, 23, 50, 96, 200]) {
      const { judge, calls } = counted(planted((p) => 0.5 - Math.abs(p.friction - 1) - p.latencyMs / 100));
      const result = await stressSearch({ judge, seed: String(budget), budget });

      expect(calls.length).toBeLessThanOrEqual(budget);
      expect(result.rollouts).toBe(calls.length);
    }
  });

  it('finds a friction failure planted below 0.45 on the hexapod', async () => {
    const model = fixtureModel('hexapod');
    const { skill, environment } = standSkill(model);
    const start = stressStart(model, { environment, seed: 'hex' });
    const physics = physicsJudge({ mj, model, environment, controller: skill.controller, start });

    try {
      const judge = async (p: StressPoint) => Math.min(await physics.judge(p), (p.friction - 0.45) * 4);
      const result = await stressSkill({ mj, model, skill, environment, judge, seed: 'hex', budget: 20 });
      const friction = result.findings.find((f) => f.axis === 'friction')!;

      expect(friction.side).toBe('below');
      expect(Math.abs(friction.boundary - 0.45)).toBeLessThan(0.05);
      expect(friction.replay.friction).toBeLessThan(0.45);
    } finally {
      physics.dispose();
    }
  }, 60_000);
});

describe('stress search, in physics', () => {
  it('finds where a stiff Stand on quad-servo starts to shake itself over: past 60 ms of servo delay', async () => {
    const model = fixtureModel('quad-servo');
    const { skill, environment } = standSkill(model, 3.25);
    const result = await stressSkill({ mj, model, skill, environment, budget: 24 });
    const [first] = result.findings;

    expect(first.axis).toBe('latencyMs');
    expect(first.side).toBe('above');
    expect(first.boundary).toBeGreaterThan(60);
    expect(first.boundary).toBeLessThan(STRESS_LIMITS.latencyMs[1]);
    expect(first.replay.latencyMs).toBeGreaterThan(first.boundary);
  }, 60_000);

  it('the Kit’s hold on Stand (quad-servo) holds everywhere in the limits, so it lists nothing', async () => {
    const model = fixtureModel('quad-servo');
    const { skill, environment } = standSkill(model);
    const result = await stressSkill({ mj, model, skill, environment, budget: 20 });

    expect(result.findings).toEqual([]);
    expect(result.axes.find((a) => a.axis === 'strength')?.worst).toBeLessThan(0.75);
    expect(result.worst.margin).toBeGreaterThan(0);
  }, 60_000);

  it('leaves Arena’s frozen constants and stored evidence byte-identical', async () => {
    const model = fixtureModel('quad-servo');
    const { skill, environment } = standSkill(model, 3.25);
    const salt = new Uint8Array(32).fill(7);
    const draw = () =>
      drawInstance(seededRandom(trialSeed({ salt, variant: 'latency', trial: 3, environment: 'e' })), {
        ranges: {
          friction: [0.8, 1.2],
          mass: [0.9, 1.1],
          strength: [0.9, 1],
          latencyMs: [0, 40],
          jointNoiseDeg: 1,
          baseYawDeg: 0,
          baseOffsetMm: 0,
        },
        bodies: 9,
        joints: 12,
      });
    const before = {
      arena: canonicalJson(ARENA),
      skill: canonicalJson(skill),
      env: canonicalJson(environment),
      draw: draw(),
    };

    await stressSkill({ mj, model, skill, environment, budget: 16 });

    expect(canonicalJson(ARENA)).toBe(before.arena);
    expect(canonicalJson(skill)).toBe(before.skill);
    expect(canonicalJson(environment)).toBe(before.env);
    expect(draw()).toEqual(before.draw);
  }, 60_000);
});
