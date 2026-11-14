import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { armReplay, importedTouch } from '../datasets/labelFixtures';
import { stageCase, stagedEffectors } from './caseCast';
import type { Case } from './schema';
import type { StoredTry } from './tryFile';
import { fittingCase, judged, recordedOnly } from './tryJudge';
import { canMark, marked } from './tryLabels';

let mj: MainModule;
let touch: Awaited<ReturnType<typeof importedTouch>>;

beforeAll(async () => {
  mj = await loadMujoco();
  touch = await importedTouch(mj);
}, 60000);

function probingABall(kase: Case): Case {
  const dot = kase.world.objects[0];
  const ball = { ...dot, id: 'ball', name: 'Ball', behavior: 'dynamic' as const };

  return {
    ...kase,
    id: 'chase-the-ball',
    world: { objects: [...kase.world.objects, ball] },
    task: {
      ...kase.task,
      probes: kase.task.probes.map((p, i) => (i ? p : { ...p, to: { object: 'ball' } })),
    },
  };
}

const counting = (kase: Case): Case => ({
  ...kase,
  id: 'count-the-dots',
  task: {
    ...kase.task,
    contract: {
      ...kase.task.contract,
      success: {
        eventually: { window: 'whole', state: { atom: { expr: { signal: 'score' }, cmp: '>=', value: 1, scale: 1 } } },
      },
    },
  },
});

function scoringFor(kase: Case) {
  const scene = { rig: touch.rig, parts: touch.robot.parts };
  const staged = stageCase(kase, scene, []);

  return {
    kase: staged.kase,
    model: touch.model,
    rig: touch.rig,
    recording: touch.recording,
    ...stagedEffectors(staged, scene),
  };
}

describe('judging a try that isn’t a Case try', () => {
  it('reads a Case as recorded-only when its probes end on the hand or fixed points', () => {
    expect(recordedOnly(touch.kase)).toBe(true);
    expect(recordedOnly(probingABall(touch.kase))).toBe(false);
    expect(recordedOnly(counting(touch.kase))).toBe(false);
  });

  it('an unjudged imported try judged by a fitting Touch a Point Case', async () => {
    const robot = { rig: touch.rig, parts: touch.robot.parts };
    const kase = fittingCase([probingABall(touch.kase), counting(touch.kase), touch.kase], robot);

    expect(kase?.id).toBe(touch.kase.id);
    expect(fittingCase([probingABall(touch.kase)], robot)).toBeNull();

    const verdict = await judged(touch.stored, scoringFor(kase!));

    expect(verdict.outcome).toMatchObject({ verdict: 'passed', by: 'contract' });
    expect(verdict.outcome.margin).toBeGreaterThan(0);
  });

  it('judges a try that never moves failed', async () => {
    const still = armReplay(mj, touch.model, { frames: touch.recording.frames, fps: 50, radians: () => 0 });
    const verdict = await judged(touch.stored, { ...scoringFor(touch.kase), recording: still });

    expect(verdict.outcome).toMatchObject({ verdict: 'failed', by: 'contract' });
  });

  it('never judges a try that has a verdict', async () => {
    const mine: StoredTry = { ...touch.stored, outcome: { verdict: 'failed', margin: null, by: 'person' } };

    expect(await judged(mine, scoringFor(touch.kase))).toBe(mine);
  });
});

describe('marking a try by hand', () => {
  it('Mark Failed on an unjudged try, and refused on a Case-judged one', async () => {
    const failed = marked(touch.stored, 'failed');

    expect(failed?.outcome).toEqual({ verdict: 'failed', margin: null, by: 'person' });
    expect(canMark(failed!)).toBe(true);
    expect(marked(failed!, 'passed')?.outcome).toEqual({ verdict: 'passed', margin: null, by: 'person' });

    const caseTry: StoredTry = {
      ...touch.stored,
      source: 'case',
      case: { id: touch.kase.id, name: touch.kase.name, hash: 'h' },
      outcome: { verdict: 'passed', margin: 3 },
    };
    const byContract = await judged(touch.stored, scoringFor(touch.kase));

    expect(canMark(caseTry)).toBe(false);
    expect(marked(caseTry, 'failed')).toBeNull();
    expect(canMark(byContract)).toBe(false);
    expect(marked(byContract, 'failed')).toBeNull();
  });
});
