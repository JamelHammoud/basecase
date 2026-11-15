import loadMujoco from '@mujoco/mujoco';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { clockSkill, quadWave } from './moveFixtures';
import { trainKitEntry } from './motorKit';
import { validationReport } from './kitValidation';
import { proveSkill } from './prove';
import { slowerSpeedEvidence } from './kitAcceptance';
import { rootHeight } from './kitModel';
import type { PolicySpec } from '../sim/policy';
import type { ForgeJob, ForgeOutcome } from './forgeRunner';
import type { ArenaEvidence } from './artifacts';

vi.mock('./kitValidation', () => ({ validationReport: vi.fn() }));
vi.mock('./prove', () => ({ proveSkill: vi.fn() }));
vi.mock('./kitAcceptance', () => ({ slowerSpeedEvidence: vi.fn(), arenaPasses: () => 96 }));

const model = fixtureModel('quad-servo');
const source = { ...clockSkill(model, quadWave()), name: 'Velocity tracking' };
let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(slowerSpeedEvidence).mockResolvedValue([]);
});

function candidate(step: number): PolicySpec {
  if (source.controller.kind !== 'policy') throw new Error('Missing fixture policy');

  return { ...source.controller.policy, trainedSteps: step };
}

function report(policy: PolicySpec, passing: number) {
  const passed = policy.trainedSteps === passing;
  const samples = passed
    ? []
    : [
        {
          joints: model.joints.map(() => 0.2),
          jointVels: model.joints.map(() => 0),
          height: 0.12,
          quat: [1, 0, 0, 0] as [number, number, number, number],
          linear: [0, 0, 0] as [number, number, number],
          angular: [0, 0, 0] as [number, number, number],
        },
      ];

  return {
    checks: [],
    score: passed ? 33 : policy.trainedSteps,
    wallS: 0.01,
    transitions: {
      binding: { physics: 'physics', actuators: 'actuators', controllers: String(policy.trainedSteps) },
      checks: [{ from: 'settle', to: 'walk', seeds: 8, falls: 0, failures: passed ? 0 : 8 }],
      passed,
      reason: passed ? '' : 'settle to walk didn’t walk 0.08 m forward in 8 of 8 tries in simulation.',
      starts: { skill: 'motor-kit', joints: model.joints.map((j) => j.id), samples },
      wallS: 0.01,
      simulatedS: 28,
    },
  };
}

function trainer() {
  const jobs: ForgeJob[] = [];
  const forge = async (job: ForgeJob): Promise<ForgeOutcome> => {
    jobs.push(job);

    return {
      ok: true,
      policy: candidate(jobs.length),
      events: [{ type: 'done', steps: 1, policy: `/runs/${jobs.length}/policy.json` }],
      stderr: '',
    };
  };

  return { forge, jobs };
}

describe('Motor Kit candidate selection and continuation', () => {
  it('selects the candidate that passes starts, including a warm-started installed policy', async () => {
    const { forge, jobs } = trainer();
    const save = vi.fn();

    vi.mocked(validationReport).mockImplementation(async ({ policy }) => report(policy, 2));

    const evidence: ArenaEvidence = {
      arenaVersion: 1,
      binding: { contract: 'contract', physics: 'physics', actuators: 'actuators', environment: 'environment' },
      confidence: 0.95,
      bar: 0.75,
      variants: [],
      lowerBound: 0.9,
      passed: true,
      conditions: [],
      summary: 'Passed in simulation.',
      saltCommitment: 'sealed',
    };

    vi.mocked(proveSkill).mockResolvedValue({ skill: source, evidence });

    const outcome = await trainKitEntry({
      mj,
      model,
      entry: 'velocity-tracking',
      design: 'quad',
      seed: 40,
      forge,
      save,
      warm: { from: 'installed', policy: candidate(0) },
      skills: [source],
    });

    expect(outcome.kind).toBe('skill');
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => (job.job as { seed: number }).seed)).toEqual([40, 41]);
    expect(jobs.every((job) => (job.job as { warmPolicy: PolicySpec }).warmPolicy.trainedSteps === 0)).toBe(true);
    expect(vi.mocked(proveSkill).mock.calls[0][0]).toMatchObject({
      controller: { policy: { trainedSteps: 2 } },
      warmStartFrom: 'installed',
      kitValidation: { passed: true, binding: { controllers: '2' } },
    });
    expect(outcome.cost.validationRuns).toBe(2);
  });

  it('feeds the failed stance into the existing continuation without saving a failed candidate', async () => {
    const { forge, jobs } = trainer();
    const save = vi.fn();

    vi.mocked(validationReport).mockImplementation(async ({ policy }) => report(policy, -1));

    const outcome = await trainKitEntry({
      mj,
      model,
      entry: 'velocity-tracking',
      design: 'quad',
      seed: 40,
      forge,
      save,
    });

    expect(outcome.kind).toBe('refused');
    expect(jobs).toHaveLength(3);
    expect(jobs[2].job).toMatchObject({ warmStart: '/runs/2', minutes: 4, delaySteps: [0, 2] });
    expect(Object.values((jobs[2].job as { initialJoints: Record<string, number> }).initialJoints)).toEqual(
      model.joints.map(() => 0.2),
    );
    expect((jobs[2].job as { rootOffset: number[] }).rootOffset[2]).toBeCloseTo(0.12 - rootHeight(model));
    expect(proveSkill).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(source.controller).toEqual(clockSkill(model, quadWave()).controller);
    expect(outcome.kind === 'refused' && outcome.reason).toContain('settle to walk');
  });
});
