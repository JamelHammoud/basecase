import { describe, expect, it } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { runFolder, type ForgeOutcome } from './forgeRunner';
import { kitJob } from './kitJob';
import { FAR_DELAYS, kitSchedule, NEAR_DELAYS, scheduledMinutes, WIDE_DELAYS, type KitStage } from './kitSchedule';
import { firstPassingTry } from './kitTries';

interface Trained {
  stage: KitStage;
  seed: number;
  from: string | null;
}

function fakePlan(options: { scores: number[]; passing?: number }) {
  const trained: Trained[] = [];
  let runs = 0;
  let judged = 0;

  const plan = {
    tries: [
      [
        { minutes: 20, delaySteps: NEAR_DELAYS },
        { minutes: 12, delaySteps: FAR_DELAYS },
      ],
      [{ minutes: 8, delaySteps: FAR_DELAYS }],
      [{ minutes: 8, delaySteps: FAR_DELAYS }],
    ],
    train: (stage: KitStage, from: { seed: number; folder: string | null }) => {
      runs += 1;
      trained.push({ stage, seed: from.seed, from: from.folder });

      return Promise.resolve({ policy: `policy-${runs}`, folder: `/runs/${runs}` });
    },
    judge: (policy: string) => {
      judged += 1;

      return Promise.resolve({
        skill: policy === `policy-${options.passing}` ? policy : null,
        score: options.scores[judged - 1] ?? 0,
      });
    },
    aborted: () => false,
  };

  return { plan, trained };
}

describe('Kit tries', () => {
  it('chain a curriculum inside a try and continue the next try from the best policy so far', async () => {
    const { plan, trained } = fakePlan({ scores: [70, 40, 10] });
    const skill = await firstPassingTry(plan);

    expect(skill).toBeNull();
    expect(trained.map((t) => [t.stage.delaySteps[1], t.seed, t.from])).toEqual([
      [1, 1, null],
      [2, 1, '/runs/1'],
      [2, 2, '/runs/2'],
      [2, 3, '/runs/2'],
    ]);
  });

  it('stop at the first policy Arena passes', async () => {
    const { plan, trained } = fakePlan({ scores: [10, 20], passing: 3 });

    expect(await firstPassingTry(plan)).toBe('policy-3');
    expect(trained).toHaveLength(3);
  });

  it('give bipeds a delay curriculum inside the old budget', () => {
    const biped = fixtureModel('biped-servo');
    const [first, ...rest] = kitSchedule(biped, 'velocity-tracking');

    expect(first.map((s) => s.delaySteps)).toEqual([NEAR_DELAYS, FAR_DELAYS]);
    expect(rest.flat().every((s) => s.delaySteps === FAR_DELAYS)).toBe(true);
    expect(scheduledMinutes(kitSchedule(biped, 'velocity-tracking'))).toBeLessThanOrEqual(40);
    expect(scheduledMinutes(kitSchedule(biped, 'stand'))).toBeLessThanOrEqual(13);
    expect(kitSchedule(biped, 'stand')[0].map((s) => s.delaySteps)).toEqual([NEAR_DELAYS, WIDE_DELAYS]);
    expect(kitSchedule(fixtureModel('quad-servo'), 'velocity-tracking').flat()).toEqual([
      { minutes: 12, delaySteps: NEAR_DELAYS },
      { minutes: 12, delaySteps: NEAR_DELAYS },
    ]);
  });

  it('send the stage’s delays and warm start to Forge', () => {
    const job = kitJob(fixtureModel('biped-servo'), 'velocity-tracking', {
      minutes: 12,
      seed: 1,
      delaySteps: FAR_DELAYS,
      warmStart: '/runs/1',
    });

    expect(job).toMatchObject({ delaySteps: [0, 2], warmStart: '/runs/1', logStdMin: -2.5, actorLinvel: false });
    expect(kitJob(fixtureModel('biped-servo'), 'stand', { minutes: 3, seed: 1 })).not.toHaveProperty('warmStart');
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
