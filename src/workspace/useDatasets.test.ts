import { describe, expect, it, vi } from 'vitest';
import type { TrySummary } from '../cases/tryFile';
import { searchTries } from '../cases/trySearch/trySearchClient';
import { datasetMembers, viewInput } from './useDatasets';

vi.mock('../cases/trySearch/trySearchClient', () => ({ searchTries: vi.fn() }));

const shown = {
  selected: [],
  order: ['a', 'b'],
  query: ' Touch a Point ',
  searching: true,
  hits: [{ tryId: 'a', from: 10, to: 20 }, { tryId: 'a', from: 40, to: 50 }, { tryId: 'b' }],
};

describe('Make Dataset from Tries mode', () => {
  it('keeps the search, so the dataset takes every try it finds and Update runs it again', () => {
    expect(viewInput(shown)).toEqual({ query: 'Touch a Point' });
  });

  it('takes the tries on screen while nothing is searched, as with a dataset open', () => {
    expect(viewInput({ ...shown, searching: false })).toEqual({ ids: ['a', 'b'] });
  });

  it('takes the selected or right-clicked tries alone', () => {
    expect(viewInput({ ...shown, selected: ['b'] })).toEqual({ ids: ['b'], samples: [{ tryId: 'b' }] });
    expect(viewInput(shown, ['a'])).toEqual({
      ids: ['a'],
      samples: [
        { tryId: 'a', from: 10, to: 20 },
        { tryId: 'a', from: 40, to: 50 },
      ],
    });
    expect(viewInput({ ...shown, searching: false }, ['a'])).toEqual({ ids: ['a'] });
  });
});

describe('freezing dataset selections', () => {
  it('keeps every exact search sample with each source try listed once', async () => {
    const samples = [{ tryId: 'a', from: 10, to: 20 }, { tryId: 'a', from: 40, to: 50 }, { tryId: 'b' }];
    const all = [{ id: 'a' }, { id: 'b' }] as TrySummary[];

    vi.mocked(searchTries).mockResolvedValue(samples as Awaited<ReturnType<typeof searchTries>>);
    expect(await datasetMembers({ query: 'grasp' }, all)).toEqual({ members: all, samples, leftOut: 0 });
    expect(searchTries).toHaveBeenCalledWith('grasp', 100_000);
  });

  it('keeps manual ids whole and reports absent tries', async () => {
    const all = [{ id: 'a' }] as TrySummary[];

    expect(await datasetMembers({ ids: ['a', 'a', 'gone'] }, all)).toEqual({
      members: all,
      samples: [{ tryId: 'a' }],
      leftOut: 1,
    });
  });
});
