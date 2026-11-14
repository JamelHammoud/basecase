import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import walk from '../routines/kit/quad-servo-velocity-tracking.skill.json';
import type { PolicySpec } from '../sim/policy';
import type { SimModel } from '../sim/mjcfTypes';
import {
  contractHash,
  currentDesign,
  skillFromTraining,
  skillHash,
  withEvidence,
  type ArenaEvidence,
  type Skill,
} from './artifacts';
import { coachSkill, type CoachInput, type CoachJudge, type CoachOutcome } from './coach';
import { measureCoachSignals, type CoachSignals } from './coachSignals';
import { environmentHash, type Environment } from './environment';
import { fixtureModel } from './fixtureModels';
import type { ForgeJob, ForgeRunner } from './forgeRunner';
import { kitEnvironment, type TrainedEntry } from './kitEnvironment';
import { kitReward } from './kitRewards';
import { designOf } from './skillsRuntime';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const WALK_POLICY = (walk as unknown as Skill).controller as { kind: 'policy'; policy: PolicySpec; robot: string };

const SIGNALS: CoachSignals = {
  foot_clearance: 18,
  contact_impulse: 0.2,
  joint_jerk: 900,
  base_height: 150,
  speed: 0.2,
};

function evidenceFor(skill: Skill, environment: Environment, passed: boolean): ArenaEvidence {
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

function readySkill(model: SimModel, entry: TrainedEntry): { skill: Skill; environment: Environment } {
  const environment = kitEnvironment(model, entry);
  const current = currentDesign({ design: designOf(model), model, environment });
  const controller = { ...WALK_POLICY, robot: environment.robot };
  const trained = skillFromTraining({ name: entry, start: null, current, environment, controller });

  return { skill: withEvidence(trained, evidenceFor(trained, environment, true), environment), environment };
}

interface Script {
  answer: unknown;
  after?: Partial<CoachSignals>;
  arena?: boolean;
  forgeError?: string;
}

function scripted(model: SimModel, entry: TrainedEntry, script: Script) {
  const { skill, environment } = readySkill(model, entry);
  const jobs: ForgeJob[] = [];
  const measured: Environment[] = [];
  const forge: ForgeRunner = async (job) => {
    jobs.push(job);

    if (script.forgeError) return { ok: false, policy: null, events: [], stderr: script.forgeError };

    return {
      ok: true,
      policy: { ...WALK_POLICY.policy, trainedSteps: 7 },
      events: [{ type: 'done', steps: 7 }],
      stderr: '',
    };
  };
  const judge: CoachJudge = {
    measure: async (_controller, env) => {
      measured.push(env);

      return measured.length === 1 ? SIGNALS : { ...SIGNALS, ...script.after };
    },
    prove: async (input) => {
      const current = currentDesign({ design: input.design, model: input.model, environment: input.environment });
      const trained = skillFromTraining({ ...input, start: null, current });
      const draft = { ...trained, warmStartFrom: input.warmStartFrom ?? null };
      const evidence = evidenceFor(draft, input.environment, script.arena ?? true);

      return { skill: evidence.passed ? withEvidence(draft, evidence, input.environment) : null, evidence };
    },
  };
  const input: CoachInput = {
    mj,
    model,
    design: designOf(model),
    entry,
    skill,
    environment,
    reward: kitReward(model, entry),
    words: 'lift your feet higher',
    ask: async () => (typeof script.answer === 'string' ? script.answer : JSON.stringify(script.answer)),
    forge,
    save: async () => undefined,
    judge,
  };

  return { input, jobs, skill, environment, measured };
}

const revised = (model: SimModel, entry: TrainedEntry, term: string) =>
  `${kitReward(model, entry)}\n\ndef style(state):\n    return ${term}\n`.replace(
    /def reward\(state\):/,
    'def reward(state):\n    extra = style(state)',
  );

const kept = (outcome: CoachOutcome) => {
  if (outcome.kind !== 'kept') throw new Error(`Expected a kept skill, got ${JSON.stringify(outcome)}`);

  return outcome;
};

describe('coachSkill', () => {
  it('lifts quad-servo’s feet on Walk with the contract unchanged and a new reward', async () => {
    const model = fixtureModel('quad-servo');
    const reward = revised(model, 'velocity-tracking', 'sum(state.joint_vel ** 2)');
    const run = scripted(model, 'velocity-tracking', {
      answer: { reward, signal: 'foot_clearance', direction: 'up' },
      after: { foot_clearance: 26 },
    });
    const outcome = kept(await coachSkill(run.input));

    expect(outcome.skill.binding.contract).toBe(run.skill.binding.contract);
    expect(outcome.skill.binding.contract).toBe(contractHash(run.environment.contract));
    expect(run.measured[1].reward).not.toEqual(run.environment.reward);
    expect(run.measured[1].contract).toBe(run.environment.contract);
    expect(run.jobs[0].job.reward).toBe(reward.trim());
    expect(outcome.change).toMatchObject({ signal: 'foot_clearance', before: 18, after: 26 });
    expect(skillHash(outcome.skill)).not.toBe(skillHash(run.skill));
  });

  it('keeps a softer landing that passes Arena', async () => {
    const model = fixtureModel('quad-servo');
    const run = scripted(model, 'velocity-tracking', {
      answer: { reward: revised(model, 'velocity-tracking', '0.0'), signal: 'contact_impulse', direction: 'down' },
      after: { contact_impulse: 0.12 },
    });

    expect(kept(await coachSkill({ ...run.input, words: 'land softly' })).change.after).toBeCloseTo(0.12);
  });

  it('drops a candidate that fails Arena, and the old skill stays', async () => {
    const model = fixtureModel('quad-servo');
    const run = scripted(model, 'velocity-tracking', {
      answer: { reward: revised(model, 'velocity-tracking', '0.0'), signal: 'foot_clearance', direction: 'up' },
      after: { foot_clearance: 30 },
      arena: false,
    });
    const outcome = await coachSkill(run.input);

    expect(outcome).toMatchObject({ kind: 'dropped', reason: 'Passed 20 of 32 with random servo delays.' });
  });

  it('drops a candidate whose named signal doesn’t move enough, before Arena', async () => {
    const model = fixtureModel('quad-servo');
    const run = scripted(model, 'velocity-tracking', {
      answer: { reward: revised(model, 'velocity-tracking', '0.0'), signal: 'foot_clearance', direction: 'up' },
      after: { foot_clearance: 18.5 },
    });
    const outcome = await coachSkill(run.input);

    expect(outcome.kind).toBe('dropped');
    expect(outcome.kind === 'dropped' && outcome.evidence).toBeNull();
  });

  it('refuses a candidate that changes the contract or the observation, before training', async () => {
    const model = fixtureModel('quad-servo');
    const reward = revised(model, 'velocity-tracking', '0.0');

    for (const extra of [{ contract: { version: 1 } }, { observation: [] }]) {
      const run = scripted(model, 'velocity-tracking', {
        answer: { reward, signal: 'speed', direction: 'down', ...extra },
      });
      const outcome = await coachSkill(run.input);

      expect(outcome.kind).toBe('refused');
      expect(run.jobs).toHaveLength(0);
    }
  });

  it('refuses a reward that doesn’t parse, and a Forge compile error drops it', async () => {
    const model = fixtureModel('quad-servo');
    const broken = scripted(model, 'velocity-tracking', {
      answer: { reward: 'import os\nreward = 1', signal: 'speed', direction: 'down' },
    });

    expect((await coachSkill(broken.input)).kind).toBe('refused');
    expect(broken.jobs).toHaveLength(0);

    const compile = scripted(model, 'velocity-tracking', {
      answer: { reward: revised(model, 'velocity-tracking', 'state.nope'), signal: 'speed', direction: 'down' },
      forgeError: 'reward: line 40: unknown name state.nope',
    });

    expect(await coachSkill(compile.input)).toMatchObject({
      kind: 'dropped',
      reason: 'reward: line 40: unknown name state.nope',
    });
  });

  it('raises the hexapod’s base height on Stand', async () => {
    const model = fixtureModel('hexapod');
    const run = scripted(model, 'stand', {
      answer: { reward: revised(model, 'stand', 'state.z'), signal: 'base_height', direction: 'up' },
      after: { base_height: 162 },
    });
    const outcome = kept(await coachSkill({ ...run.input, words: 'stand taller' }));

    expect(outcome.change.after).toBeGreaterThan(outcome.change.before);
    expect(outcome.skill.binding.contract).toBe(run.skill.binding.contract);
  });

  it('slows biped-servo’s Walk while Walk’s contract still passes', async () => {
    const model = fixtureModel('biped-servo');
    const run = scripted(model, 'velocity-tracking', {
      answer: { reward: revised(model, 'velocity-tracking', '0.0'), signal: 'speed', direction: 'down' },
      after: { speed: 0.15 },
    });
    const outcome = kept(await coachSkill({ ...run.input, words: 'walk slower' }));

    expect(outcome.evidence.passed).toBe(true);
    expect(outcome.change.after).toBeLessThan(outcome.change.before);
  });

  it('warm-starts from the old skill and names it', async () => {
    const model = fixtureModel('quad-servo');
    const run = scripted(model, 'velocity-tracking', {
      answer: { reward: revised(model, 'velocity-tracking', '0.0'), signal: 'foot_clearance', direction: 'up' },
      after: { foot_clearance: 26 },
    });
    const outcome = kept(await coachSkill(run.input));

    expect(outcome.skill.warmStartFrom).toBe(skillHash(run.skill));
    expect(run.jobs[0].job.warmPolicy).toEqual(WALK_POLICY.policy);
  });

  it('gives the same result for the same scripted answers', async () => {
    const model = fixtureModel('quad-servo');
    const script: Script = {
      answer: { reward: revised(model, 'velocity-tracking', '0.0'), signal: 'foot_clearance', direction: 'up' },
      after: { foot_clearance: 26 },
    };
    const first = kept(await coachSkill(scripted(model, 'velocity-tracking', script).input));
    const second = kept(await coachSkill(scripted(model, 'velocity-tracking', script).input));

    expect(skillHash({ ...second.skill, origin: first.skill.origin })).toBe(skillHash(first.skill));
    expect(second.change).toEqual(first.change);
  });
});

describe('measureCoachSignals', () => {
  it('measures one clean run: Walk moves and lifts its feet, holding still doesn’t', async () => {
    const model = fixtureModel('quad-servo');
    const environment = kitEnvironment(model, 'velocity-tracking');
    const controller = { ...WALK_POLICY, robot: environment.robot };
    const walking = await measureCoachSignals({ mj, model, environment, controller });
    const holding = await measureCoachSignals({ mj, model, environment, controller: { kind: 'hold' } });

    expect(walking.speed).toBeGreaterThan(0.1);
    expect(Math.abs(holding.speed)).toBeLessThan(0.02);
    expect(walking.foot_clearance).toBeGreaterThan(holding.foot_clearance + 2);
    expect(walking.joint_jerk).toBeGreaterThan(holding.joint_jerk);
    expect(walking.contact_impulse).toBeGreaterThan(0);
    expect(walking.base_height).toBeGreaterThan(50);
  }, 60_000);
});
