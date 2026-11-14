import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SimModel } from '../sim/mjcfTypes';
import { currentDesign, skillFromTraining, withEvidence, type ArenaEvidence, type Skill } from './artifacts';
import type { CoachJudge } from './coach';
import { environmentHash, type Environment } from './environment';
import { fixtureModel } from './fixtureModels';
import type { ForgeJob, ForgeRunner } from './forgeRunner';
import { kitEnvironment } from './kitEnvironment';
import { kitRobot } from './kitModel';
import { designOf } from './skillsRuntime';
import { NOMINAL, type StressFinding } from './stress';
import { standingPolicy } from './stressFixtures';
import { stressJob, trainOnFindings, widenedEnvironment } from './stressTrain';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const model = fixtureModel('quad-servo');
const environment = kitEnvironment(model, 'stand');

const heavy: StressFinding = {
  axis: 'mass',
  side: 'above',
  boundary: 1.3,
  margin: -0.4,
  replay: { ...NOMINAL, mass: 2 },
};
const late: StressFinding = {
  axis: 'latencyMs',
  side: 'above',
  boundary: 74,
  margin: -27.9,
  replay: { ...NOMINAL, latencyMs: 150 },
};

function evidence(skill: Skill, env: Environment, passed: boolean): ArenaEvidence {
  const variant = (name: ArenaEvidence['variants'][number]['variant']) => ({
    variant: name,
    trials: 32,
    passes: passed ? 31 : 20,
    lowerBound: passed ? 0.86 : 0.45,
    diverged: 0,
    failures: {},
  });

  return {
    arenaVersion: 1,
    binding: { ...skill.binding, environment: environmentHash(env) },
    confidence: 0.95,
    bar: 0.75,
    variants: [variant('held-out'), variant('half-timestep'), variant('latency')],
    lowerBound: passed ? 0.86 : 0.45,
    passed,
    conditions: [],
    summary: passed ? 'Passed 31 of 32 in every variant.' : 'Passed 20 of 32 with random servo delays.',
    saltCommitment: 'salt',
  };
}

function ready(m: SimModel): Skill {
  const current = currentDesign({ design: designOf(m), model: m, environment });
  const controller = { kind: 'policy' as const, policy: standingPolicy(m), robot: kitRobot(m).key };
  const trained = skillFromTraining({ name: 'Stand', start: null, current, environment, controller });

  return withEvidence(trained, evidence(trained, environment, true), environment);
}

function harness(passes: boolean) {
  const jobs: ForgeJob[] = [];
  const proved: Environment[] = [];
  const forge: ForgeRunner = async (job) => {
    jobs.push(job);

    return { ok: true, policy: standingPolicy(model, { trainedSteps: 7 }), events: [], stderr: '' };
  };
  const judge: CoachJudge = {
    measure: async () => {
      throw new Error('Training on findings measures nothing.');
    },
    prove: async (input) => {
      proved.push(input.environment);

      const current = currentDesign({ design: input.design, model: input.model, environment: input.environment });
      const draft = {
        ...skillFromTraining({ ...input, start: null, current }),
        warmStartFrom: input.warmStartFrom ?? null,
      };
      const proof = evidence(draft, input.environment, passes);

      return { skill: passes ? withEvidence(draft, proof, input.environment) : null, evidence: proof };
    },
  };

  return { jobs, proved, forge, judge };
}

describe('Train on These', () => {
  it('widens only the failing axis’s range, to cover the failing values', () => {
    const widened = widenedEnvironment(environment, [heavy]);

    expect(widened.randomization).toEqual({ ...environment.randomization, mass: [0.9, 2] });
    expect(widenedEnvironment(environment, [late]).randomization.latencyMs).toEqual([0, 150]);
  });

  it('warm-starts Forge from the skill on the widened ranges, and keeps it when Arena passes', async () => {
    const skill = ready(model);
    const run = harness(true);
    const outcome = await trainOnFindings({
      mj,
      model,
      design: designOf(model),
      entry: 'stand',
      skill,
      environment,
      findings: [heavy, late],
      forge: run.forge,
      save: async () => undefined,
      judge: run.judge,
    });
    const job = run.jobs[0].job as ReturnType<typeof stressJob>;

    expect(outcome.kind).toBe('kept');
    expect(job.warmPolicy).toEqual(standingPolicy(model));
    expect(job.randomization.mass).toEqual([0.85, 2]);
    expect(job.randomization.friction).toEqual([0.6, 1.3]);
    expect(job.delaySteps).toEqual([0, 8]);
    expect(run.proved[0].randomization.mass).toEqual([0.9, 2]);
  });

  it('drops a candidate that fails Arena, so the old skill stays', async () => {
    const run = harness(false);
    const outcome = await trainOnFindings({
      mj,
      model,
      design: designOf(model),
      entry: 'stand',
      skill: ready(model),
      environment,
      findings: [heavy],
      forge: run.forge,
      save: async () => undefined,
      judge: run.judge,
    });

    expect(outcome).toMatchObject({ kind: 'dropped', reason: 'Passed 20 of 32 with random servo delays.' });
  });
});
