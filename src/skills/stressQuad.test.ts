import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { ARENA } from './arena';
import { fixtureModel } from './fixtureModels';
import { canonicalJson } from './hash';
import { holdingPolicy, readyStand } from './hubSkillFixtures';
import { kitEnvironment } from './kitEnvironment';
import { kitJob } from './kitJob';
import { kitRobot } from './kitModel';
import { stressSkill } from './stress';
import { NOMINAL_RUN, stressBench } from './stressProbe';

const SWING_RAD = 0.76;
const BUDGET = 24;
const LEG_SIGN = [1, -1, 1, -1];
const model = fixtureModel('quad-servo');
const environment = kitEnvironment(model, 'stand');
let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function swungStand() {
  const policy = holdingPolicy(kitJob(model, 'stand', { minutes: 1, seed: 1 }));
  const defaultPose = policy.defaultPose.map((d, i) =>
    policy.joints[i].includes('swing') ? d + SWING_RAD * LEG_SIGN[Number(policy.joints[i][3])] : d,
  );

  return {
    ...readyStand(model, 'quad'),
    controller: { kind: 'policy' as const, policy: { ...policy, defaultPose }, robot: kitRobot(model).key },
  };
}

describe('stressSkill on quad-servo Stand', () => {
  it('finds where a swung-leg Stand sags under mass, and leaves Arena and the skill alone', async () => {
    const skill = swungStand();
    const arena = canonicalJson(ARENA);
    const stored = canonicalJson(skill);
    const result = await stressSkill({ mj, model, skill, environment, budget: BUDGET });
    const [finding] = result.findings;

    expect(result.rollouts).toBeLessThanOrEqual(BUDGET);
    expect(result.nominal).toBeGreaterThan(0);
    expect(result.findings).toHaveLength(1);
    expect(finding).toMatchObject({ axis: 'mass', side: 'above' });

    const bench = stressBench({ mj, model, controller: skill.controller, environment, start: result.start });

    try {
      expect(await bench.probe({ ...NOMINAL_RUN, mass: finding.boundary! - 0.15 })).toBeGreaterThan(0);
      expect(await bench.probe({ ...NOMINAL_RUN, mass: finding.boundary! + 0.15 })).toBeLessThanOrEqual(0);
    } finally {
      bench.dispose();
    }

    expect(canonicalJson(ARENA)).toBe(arena);
    expect(canonicalJson(skill)).toBe(stored);
  }, 60000);
});
