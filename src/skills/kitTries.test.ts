import { describe, expect, it } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { runFolder, type ForgeOutcome } from './forgeRunner';
import { kitJob } from './kitJob';
import {
  FAR_DELAYS,
  kitSchedule,
  NEAR_DELAYS,
  scheduledMinutes,
  VELOCITY_RAMP,
  VELOCITY_SEEDS,
  WIDE_DELAYS,
  type KitStage,
  type KitTry,
} from './kitSchedule';
import { firstPassingTry } from './kitTries';

interface Trained {
  stage: KitStage;
  seed: number;
  from: string | null;
}

function fakePlan(options: { tries: KitTry[]; scores: number[]; passing?: number; validation?: number[] }) {
  const trained: Trained[] = [];
  const judgedPolicies: string[] = [];
  let runs = 0;

  const plan = {
    tries: options.tries,
    train: (stage: KitStage, from: { seed: number; folder: string | null }) => {
      runs += 1;
      trained.push({ stage, seed: from.seed, from: from.folder });

      return Promise.resolve({ policy: `policy-${runs}`, folder: `/runs/${runs}` });
    },
    validate: (policy: string) => Promise.resolve(options.validation?.[Number(policy.split('-')[1]) - 1] ?? 0),
    judge: (policy: string) => {
      judgedPolicies.push(policy);

      return Promise.resolve({
        skill: policy === `policy-${options.passing}` ? policy : null,
        score: options.scores[judgedPolicies.length - 1] ?? 0,
      });
    },
    aborted: () => false,
  };

  return { plan, trained, judgedPolicies };
}

const one = (...stages: KitStage[]): KitTry => ({ stages, seeds: 1 });

describe('Kit tries', () => {
  it('chain the stages of a try and continue the next try from the best policy so far', async () => {
    const tries = [
      one({ minutes: 20, delaySteps: NEAR_DELAYS }, { minutes: 12, delaySteps: FAR_DELAYS }),
      one({ minutes: 8, delaySteps: FAR_DELAYS }),
      one({ minutes: 8, delaySteps: FAR_DELAYS }),
    ];
    const { plan, trained } = fakePlan({ tries, scores: [70, 40, 10] });

    expect(await firstPassingTry(plan)).toBeNull();
    expect(trained.map((t) => [t.stage.delaySteps[1], t.seed, t.from])).toEqual([
      [1, 1, null],
      [2, 1, '/runs/1'],
      [2, 2, '/runs/2'],
      [2, 3, '/runs/2'],
    ]);
  });

  it('stop at the first policy Arena passes', async () => {
    const tries = [one({ minutes: 4, delaySteps: NEAR_DELAYS }), one({ minutes: 4, delaySteps: NEAR_DELAYS })];
    const { plan, trained } = fakePlan({ tries, scores: [10], passing: 1 });

    expect(await firstPassingTry(plan)).toBe('policy-1');
    expect(trained).toHaveLength(1);
  });

  it('train every seed of a try, judge only the one validation ranks first, and continue from it', async () => {
    const tries: KitTry[] = [
      { stages: [{ minutes: 6, delaySteps: FAR_DELAYS }], seeds: 3 },
      one({ minutes: 4, delaySteps: FAR_DELAYS }),
    ];
    const { plan, trained, judgedPolicies } = fakePlan({ tries, scores: [5, 1], validation: [0.4, 0.9, 0.6] });

    expect(await firstPassingTry(plan)).toBeNull();
    expect(trained.map((t) => [t.seed, t.from])).toEqual([
      [1, null],
      [2, null],
      [3, null],
      [4, '/runs/2'],
    ]);
    expect(judgedPolicies).toEqual(['policy-2', 'policy-4']);
  });

  it('give every legged robot the same Velocity tracking path, inside the gate’s budgets', () => {
    for (const robot of ['quad-servo', 'hexapod', 'biped-servo']) {
      const [first, ...rest] = kitSchedule(fixtureModel(robot), 'velocity-tracking');

      expect(first.seeds).toBe(VELOCITY_SEEDS);
      expect(first.stages).toEqual([expect.objectContaining({ delaySteps: FAR_DELAYS, delayRamp: VELOCITY_RAMP })]);
      expect(rest.every((t) => t.seeds === 1 && t.stages.every((s) => s.delaySteps === FAR_DELAYS))).toBe(true);
    }

    expect(scheduledMinutes(kitSchedule(fixtureModel('quad-servo'), 'velocity-tracking'))).toBeLessThanOrEqual(23);
    expect(scheduledMinutes(kitSchedule(fixtureModel('biped-servo'), 'velocity-tracking'))).toBeLessThanOrEqual(36);
    expect(scheduledMinutes(kitSchedule(fixtureModel('biped-servo'), 'stand'))).toBeLessThanOrEqual(13);
    expect(kitSchedule(fixtureModel('biped-servo'), 'stand')[0].stages.map((s) => s.delaySteps)).toEqual([
      NEAR_DELAYS,
      WIDE_DELAYS,
    ]);
  });

  it('send the stage’s delays, ramp and warm start to Forge, on the GPU loop', () => {
    const job = kitJob(fixtureModel('biped-servo'), 'velocity-tracking', {
      minutes: 12,
      seed: 1,
      delaySteps: FAR_DELAYS,
      delayRamp: VELOCITY_RAMP,
      warmStart: '/runs/1',
    });

    expect(job).toMatchObject({
      delaySteps: [0, 2],
      delayRamp: VELOCITY_RAMP,
      warmStart: '/runs/1',
      logStdMin: -2.5,
      squash: 'tanh',
      backend: 'metal',
      gpuEnvs: 4096,
      actorLinvel: false,
    });
    expect(kitJob(fixtureModel('biped-servo'), 'stand', { minutes: 3, seed: 1 })).not.toHaveProperty('warmStart');
    expect(kitJob(fixtureModel('biped-servo'), 'stand', { minutes: 3, seed: 1 })).not.toHaveProperty('backend');
  });

  it('find a run’s folder from its done event, only when it is absolute', () => {
    const outcome = (policy: string): ForgeOutcome => ({
      ok: true,
      policy: null,
      events: [{ type: 'progress' }, { type: 'done', steps: 10, policy }],
      stderr: '',
    });

    expect(runFolder(outcome('/kit/runs/003-stand/policy.json'))).toBe('/kit/runs/003-stand');
    expect(runFolder(outcome('C:\\kit\\runs\\003\\policy.json'))).toBe('C:\\kit\\runs\\003');
    expect(runFolder(outcome('runs/003/policy.json'))).toBeNull();
    expect(runFolder({ ...outcome('/kit/policy.json'), ok: false })).toBeNull();
    expect(runFolder({ ...outcome('runs/003/policy.json'), run: 'policy-abc' })).toBe('policy-abc');
    expect(runFolder({ ...outcome('runs/003/policy.json'), run: 'policy-abc', ok: false })).toBeNull();
  });
});
