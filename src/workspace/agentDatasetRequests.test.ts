import { describe, expect, it } from 'vitest';
import type { Case } from '../cases/schema';
import { newDataset } from '../datasets/datasetFile';
import { DATASET_HANDLERS } from './agentDatasetRequests';
import type { MadeDataset, MakeDatasetInput } from './useDatasets';

const touch = { id: 'case-touch', name: 'Touch a Point' } as Case;

function contextWith(answer?: (input: MakeDatasetInput) => MadeDataset) {
  const calls: MakeDatasetInput[] = [];
  const make = async (input: MakeDatasetInput): Promise<MadeDataset> => {
    calls.push(input);

    if (answer) return answer(input);

    const members = input.ids ?? ['try-1', 'try-2', 'try-3'];
    const dataset = newDataset({
      id: 'ds-1',
      name: input.name ?? 'Touch Tries',
      task: input.task ?? 'Touch the dot',
      caseId: input.caseId,
      query: input.query,
      members,
      at: '2026-11-14T00:00:00.000Z',
    });

    return { dataset, leftOut: input.ids ? 1 : 0 };
  };

  return { ctx: { cases: { cases: [touch] }, datasets: { make }, setAction: () => {} }, calls };
}

const make = (payload: Record<string, unknown>, ctx: ReturnType<typeof contextWith>['ctx']) =>
  DATASET_HANDLERS.make_dataset(payload, ctx);

describe('make_dataset payload', () => {
  it('passes a query through and replies with the dataset', async () => {
    const { ctx, calls } = contextWith();
    const reply = await make({ query: 'Touch a Point', task: 'Touch the red dot' }, ctx);

    expect(calls).toEqual([{ query: 'Touch a Point', task: 'Touch the red dot' }]);
    expect(reply).toEqual({
      ok: true,
      id: 'ds-1',
      name: 'Touch Tries',
      task: 'Touch the red dot',
      case: null,
      tries: 3,
      query: 'Touch a Point',
      left_out: 0,
    });
  });

  it('passes ids through and counts the ones left out', async () => {
    const { ctx, calls } = contextWith();
    const reply = await make({ ids: ['try-1', 'try-2'], name: 'Two Tries' }, ctx);

    expect(calls).toEqual([{ ids: ['try-1', 'try-2'], name: 'Two Tries' }]);
    expect(reply).toMatchObject({ ok: true, name: 'Two Tries', tries: 2, query: null, left_out: 1 });
  });

  it('refuses both or neither of query and ids without making one', async () => {
    const { ctx, calls } = contextWith();

    expect(await make({ query: 'Touch', ids: ['try-1'] }, ctx)).toMatchObject({
      ok: false,
      problem: expect.any(String),
    });
    expect(await make({}, ctx)).toMatchObject({ ok: false, problem: expect.any(String) });
    expect(await make({ query: '  ' }, ctx)).toMatchObject({ ok: false });
    expect(await make({ ids: [] }, ctx)).toMatchObject({ ok: false });
    expect(await make({ ids: ['../secrets'] }, ctx)).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it('resolves a Case named by name to its id, and names it in the reply', async () => {
    const { ctx, calls } = contextWith();
    const reply = await make({ query: 'Touch', case: 'touch a point' }, ctx);

    expect(calls[0].caseId).toBe('case-touch');
    expect(reply).toMatchObject({ ok: true, case: 'Touch a Point' });
  });

  it('refuses a Case this scene doesn’t have', async () => {
    const { ctx, calls } = contextWith();

    expect(await make({ query: 'Touch', case: 'Push the Crate' }, ctx)).toEqual({
      ok: false,
      problem: 'This scene has no Case named Push the Crate.',
    });
    expect(calls).toEqual([]);
  });

  it('replies with the problem make returns', async () => {
    const { ctx } = contextWith(() => ({ problem: 'No try matches Wave.' }));

    expect(await make({ query: 'Wave' }, ctx)).toEqual({ ok: false, problem: 'No try matches Wave.' });
  });
});
