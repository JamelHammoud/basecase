import { describe, expect, it } from 'vitest';
import type { Case } from '../cases/schema';
import { IMAGE_HANDLERS } from './agentImageRequests';
import type { TrainingImageInput } from './trainingImageInput';

const kase = { id: 'blocks', name: 'Blocks' } as Case;

function context() {
  const calls: Array<{ input: TrainingImageInput; kase: Case }> = [];
  const make = async (input: TrainingImageInput, selected: Case) => {
    calls.push({ input, kase: selected });

    return { frameSet: { id: 'frames-1' }, dataset: { id: 'dataset-1' }, classCounts: { block: 20 } };
  };

  return { calls, ctx: { cases: { cases: [kase], active: kase, images: { make } }, setAction: () => {} } };
}

describe('make_images payload', () => {
  it('resolves the Case and passes explicit rendering choices to the shared job', async () => {
    const { ctx, calls } = context();
    const reply = await IMAGE_HANDLERS.make_images(
      { case: 'blocks', count: 20, cameras: ['scene'], classes: ['block'], seed: 7 },
      ctx,
    );

    expect(calls).toEqual([{ input: { count: 20, cameras: ['scene'], classes: ['block'], seed: 7 }, kase }]);
    expect(reply).toEqual({ ok: true, frame_set: 'frames-1', dataset: 'dataset-1', class_counts: { block: 20 } });
  });

  it('uses the open Case and defaults when choices are omitted', async () => {
    const { ctx, calls } = context();

    await IMAGE_HANDLERS.make_images({}, ctx);
    expect(calls).toEqual([{ input: { count: 20, seed: 1 }, kase }]);
  });

  it.each([
    { count: 0 },
    { count: 1.5 },
    { count: 1001 },
    { seed: 0x100000000 },
    { count: '20' },
    { count: null },
    { seed: null },
    { cameras: [] },
    { cameras: [''] },
    { classes: [4] },
    { seed: NaN },
    { seed: -1 },
    { case: 'elsewhere' },
  ])('refuses malformed choices before rendering: %j', async (payload) => {
    const { ctx, calls } = context();

    expect(await IMAGE_HANDLERS.make_images(payload, ctx)).toMatchObject({ ok: false, problem: expect.any(String) });
    expect(calls).toEqual([]);
  });

  it('refuses generation without a Case', async () => {
    const { ctx, calls } = context();

    ctx.cases.cases = [];
    Object.assign(ctx.cases, { active: null });
    expect(await IMAGE_HANDLERS.make_images({}, ctx)).toMatchObject({ ok: false, problem: expect.any(String) });
    expect(calls).toEqual([]);
  });
});
