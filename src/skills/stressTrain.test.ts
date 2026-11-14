import type { MainModule } from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import walk from '../routines/kit/quad-servo-velocity-tracking.skill.json';
import type { PolicySpec } from '../sim/policy';
import { currentDesign, skillFromTraining, skillHash, withEvidence, type ArenaEvidence, type Skill } from './artifacts';
import { environmentHash, type Environment } from './environment';
import { fixtureModel } from './fixtureModels';
import type { ForgeJob } from './forgeRunner';
import { kitEnvironment } from './kitEnvironment';
import { kitReward } from './kitRewards';
import type { ProveInput } from './prove';
import { designOf } from './skillsRuntime';
import { stressPoint, widenedEnvironment, type StressFinding } from './stress';
import { FORGE_RANGES, trainOnFindings } from './stressTrain';

const model = fixtureModel('quad-servo');
const WALK_POLICY = (walk as unknown as Skill).controller as { kind: 'policy'; policy: PolicySpec; robot: string };

function evidence(skill: Pick<Skill, 'binding'>, environment: Environment, passed: boolean): ArenaEvidence {
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
    binding: { ...skill.binding, environment: environmentHash(environment) },
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

function ready() {
  const environment = kitEnvironment(model, 'velocity-tracking');
  const current = currentDesign({ design: designOf(model), model, environment });
  const controller = { ...WALK_POLICY, robot: environment.robot };
  const trained = skillFromTraining({ name: 'Walk', start: null, current, environment, controller });

  return { skill: withEvidence(trained, evidence(trained, environment, true), environment), environment };
}

const strengthFinding: StressFinding = {
  axis: 'strength',
  side: 'below',
  boundary: 0.76,
  margin: -5.96,
  point: stressPoint({ strength: 0.4 }),
};

function run(passes: boolean) {
  const { skill, environment } = ready();
  const jobs: ForgeJob[] = [];
  const proved: Environment[] = [];
  const outcome = trainOnFindings({
    mj: {} as MainModule,
    model,
    design: designOf(model),
    entry: 'velocity-tracking',
    skill,
    environment,
    reward: kitReward(model, 'velocity-tracking'),
    findings: [strengthFinding],
    forge: (job) => {
      jobs.push(job);

      return Promise.resolve({ ok: true, policy: WALK_POLICY.policy, events: [], stderr: '' });
    },
    save: () => Promise.resolve(),
    prove: (input: ProveInput) => {
      proved.push(input.environment);

      const draft = { binding: { ...skill.binding, environment: environmentHash(input.environment) } };
      const result = evidence(draft, input.environment, passes);
      const kept = passes ? { ...skill, evidence: result, warmStartFrom: input.warmStartFrom ?? null } : null;

      return Promise.resolve({ skill: kept, evidence: result });
    },
  });

  return { outcome, jobs, proved, skill, environment };
}

describe('Train on These', () => {
  it('widens only the failing axis, clamped to the limits', () => {
    const environment = kitEnvironment(model, 'stand');
    const wide = widenedEnvironment(environment, [strengthFinding]);
    const { strength, ...others } = wide.randomization;
    const { strength: before, ...unchanged } = environment.randomization;

    expect(strength).toEqual([0.4, before[1]]);
    expect(others).toEqual(unchanged);
    expect(wide.contract).toEqual(environment.contract);

    const beyond = widenedEnvironment(environment, [
      { ...strengthFinding, point: { ...strengthFinding.point, strength: 0.1 } },
    ]);

    expect(beyond.randomization.strength).toEqual([0.4, 1]);
  });

  it('warm-starts Forge on the wider ranges and keeps the skill only when Arena passes it', async () => {
    const { outcome, jobs, proved, skill } = run(true);
    const result = await outcome;
    const job = jobs[0].job as Record<string, unknown>;

    expect(job.warmPolicy).toEqual(WALK_POLICY.policy);
    expect(job.physicsRanges).toEqual({
      friction: [...FORGE_RANGES.friction],
      mass: [...FORGE_RANGES.mass],
      strength: [0.4, 1],
    });
    expect(proved[0].randomization.strength).toEqual([0.4, 1]);
    expect(result.kind).toBe('kept');
    expect(result.kind === 'kept' && result.skill.warmStartFrom).toBe(skillHash(skill));
  });

  it('drops a candidate that fails Arena and keeps the old skill', async () => {
    const result = await run(false).outcome;

    expect(result.kind).toBe('dropped');
    expect(result.kind === 'dropped' && result.evidence?.passed).toBe(false);
  });

  it('sends no strength range when strength was not a finding', async () => {
    const { skill, environment } = ready();
    const jobs: ForgeJob[] = [];

    await trainOnFindings({
      mj: {} as MainModule,
      model,
      design: designOf(model),
      entry: 'velocity-tracking',
      skill,
      environment,
      reward: kitReward(model, 'velocity-tracking'),
      findings: [
        { axis: 'latencyMs', side: 'above', boundary: 52, margin: -25, point: stressPoint({ latencyMs: 150 }) },
      ],
      forge: (job) => {
        jobs.push(job);

        return Promise.resolve({ ok: false, policy: null, events: [], stderr: 'stub' });
      },
      save: () => Promise.resolve(),
    });

    const job = jobs[0].job as { physicsRanges: Record<string, unknown>; delaySteps: number[] };

    expect(job.physicsRanges.strength).toBeUndefined();
    expect(job.delaySteps[1]).toBe(8);
  });
});
