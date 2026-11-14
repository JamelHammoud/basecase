import { describe, expect, it } from 'vitest';
import type { Dataset } from '../datasets/datasetFile';
import { viewInput } from './useDatasets';

const shown = { selected: [], order: ['a', 'b'], query: 'Touch a Point', dataset: null };

describe('Make Dataset from Tries mode', () => {
  it('keeps the Library search when Tries shows what it matches', () => {
    expect(viewInput(shown)).toEqual({ ids: ['a', 'b'], query: 'Touch a Point' });
  });

  it('takes only the tries on screen while a dataset is open, whatever the Library search still holds', () => {
    expect(viewInput({ ...shown, dataset: { id: 'open' } as Dataset })).toEqual({ ids: ['a', 'b'] });
  });

  it('takes the selected or right-clicked tries alone', () => {
    expect(viewInput({ ...shown, selected: ['b'] })).toEqual({ ids: ['b'] });
    expect(viewInput(shown, ['a'])).toEqual({ ids: ['a'] });
  });
});
