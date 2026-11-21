import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runArena } from './arena';
import { contractHash, modelHashes } from './artifacts';
import { environmentHash } from './environment';
import { fixtureModel } from './fixtureModels';
import type { ForgeJob, ForgeOutcome } from './forgeRunner';
import { holdingPolicy } from './hubSkillFixtures';
import { kitEnvironment } from './kitEnvironment';
import { kitJob } from './kitJob';
import { trainKitEntry } from './motorKit';
import { moveAnalysis, moveEnvironment } from './moveEnvironment';
import { quadSit } from './moveFixtures';
import { rewardSearch } from './raceRewardSearch';
import { trackMotion } from './raceTracking';
import { judgeRollout } from './rollout';
import { draftEnvironment } from './teachEnvironment';
import { kitSpeedContract } from './kitEnvironment';

vi.mock('./arena', async (original) => ({ ...(await original<typeof import('./arena')>()), runArena: vi.fn() }));
vi.mock('./rollout', () => ({ judgeRollout: vi.fn() }));

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(judgeRollout).mockImplementation(async ({ controller }) => ({
    passed: true,
    margin: controller.kind === 'policy' ? controller.policy.trainedSteps : 0,
    label: 'Development',
    diverged: false,
    worstAt: 0,
    failed: [],
  }));
  vi.mocked(runArena).mockImplementation(async (input) => ({
    arenaVersion: 1,
    binding: {
      contract: contractHash(input.contract),
      physics: modelHashes(input.model).physics,
      actuators: modelHashes(input.model).actuators,
      environment: environmentHash(input.environment!),
    },
    confidence: 0.95,
    bar: 0.9,
    variants: [],
    lowerBound: 1,
    passed: true,
    conditions: [],
    summary: 'Locally passed',
    saltCommitment: 'local',
  }));
});

function grouped(job: ForgeJob): ForgeOutcome {
  return {
    ok: true,
    policy: null,
    events: [{ type: 'done', steps: 24 }],
    stderr: '',
    candidates: [0, 1].map((index) => ({
      id: `policy-child-${index}`,
      seed: Number(job.job.seed) + index,
      policy: { ...holdingPolicy(job.job), trainedSteps: index + 1 },
      steps: 12,
      fingerprint: { 'job.json': JSON.stringify(job.job) },
      development: { kind: 'remote-ready-claim', score: 999 - index },
    })),
  };
}

describe('grouped seeds across the shipped skill paths', () => {
  it.each(['quad-servo', 'hexapod'])(
    'selects and locally proves Stand on %s with unchanged powered ordering',
    async (id) => {
      const model = fixtureModel(id);
      const forge = vi.fn(async (job: ForgeJob) => grouped(job));
      const save = vi.fn(async () => {});
      const outcome = await trainKitEntry({ mj, model, design: id, entry: 'stand', forge, save, seed: 51 });

      expect(outcome.kind).toBe('skill');
      expect(forge).toHaveBeenCalledOnce();
      expect(runArena).toHaveBeenCalledOnce();

      if (outcome.kind !== 'skill') throw new Error(outcome.reason);

      expect(outcome.skill.origin?.training?.selected).toBe('policy-child-1');
      expect(outcome.skill.action.joints).toEqual(kitEnvironment(model, 'stand').action.joints);
      expect(outcome.skill.origin?.cost.steps).toBe(24);
      expect(save).toHaveBeenCalledOnce();
    },
  );

  it('keeps a supplied warm start frozen for both development candidates', async () => {
    const model = fixtureModel('quad-servo');
    const policy = holdingPolicy(kitJob(model, 'stand', { minutes: 1, seed: 1 }));
    const forge = vi.fn(async (job: ForgeJob) => grouped(job));

    await trainKitEntry({
      mj,
      model,
      design: 'quad',
      entry: 'stand',
      seed: 21,
      forge,
      save: async () => {},
      warm: { from: 'retained-skill', policy },
    });
    expect(forge.mock.calls[0][0].job.warmPolicy).toBe(policy);
    expect(vi.mocked(runArena).mock.calls[0][0].controller.kind).toBe('policy');
  });

  it('selects a taught motion before its single local Arena judgment', async () => {
    const model = fixtureModel('quad-servo');
    const animation = quadSit();
    const environment = moveEnvironment(model, animation);
    const forge = vi.fn(async (job: ForgeJob) => grouped(job));
    const outcome = await trackMotion(
      {
        mj,
        forge,
        save: async () => {},
        seed: 1,
        task: {
          id: 'Sit',
          design: 'quad',
          model,
          environment,
          analysis: moveAnalysis(model),
          goal: { kind: 'track', animation },
        },
      },
      { started: performance.now(), steps: 0 },
    );

    expect(outcome.skill?.origin?.training?.selected).toBe('policy-child-1');
    expect(runArena).toHaveBeenCalledOnce();
    expect(forge).toHaveBeenCalledOnce();
  });

  it('runs rover velocity development before Arena and ends reward search when that winner is refused', async () => {
    const model = fixtureModel('rover-diff');
    const environment = draftEnvironment(model, {
      name: 'Drive',
      request: 'Track velocity',
      goal: { kind: 'velocity', command: [0.1, 0, 0] },
      seconds: 2,
      contract: kitSpeedContract(model, 0.1),
    });
    const forge = vi.fn(async (job: ForgeJob) => grouped(job));

    const judge = vi.mocked(runArena).getMockImplementation()!;

    vi.mocked(runArena).mockImplementationOnce(async (input) => ({
      ...(await judge(input)),
      passed: false,
    }));

    const outcome = await rewardSearch(
      {
        mj,
        forge,
        save: async () => {},
        seed: 1,
        task: {
          id: 'Drive',
          design: 'rover',
          model,
          environment,
          analysis: moveAnalysis(model),
          goal: { kind: 'velocity', command: [0.1, 0, 0] },
        },
      },
      { started: performance.now(), steps: 0 },
    );

    expect(outcome.skill).toBeNull();
    expect(outcome.attempt.terminal).toBe(true);
    expect(forge).toHaveBeenCalledOnce();
    expect(runArena).toHaveBeenCalledOnce();
    expect(judgeRollout).toHaveBeenCalledTimes(2);
  });
});
