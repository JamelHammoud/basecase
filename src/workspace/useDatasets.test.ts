import { describe, expect, it } from 'vitest';
import { viewInput } from './useDatasets';

const shown = { selected: [], order: ['a', 'b'], query: ' Touch a Point ', searching: true };

describe('Make Dataset from Tries mode', () => {
  it('keeps the search, so the dataset takes every try it finds and Update runs it again', () => {
    expect(viewInput(shown)).toEqual({ query: 'Touch a Point' });
  });

  it('takes the tries on screen while nothing is searched, as with a dataset open', () => {
    expect(viewInput({ ...shown, searching: false })).toEqual({ ids: ['a', 'b'] });
  });

  it('takes the selected or right-clicked tries alone', () => {
    expect(viewInput({ ...shown, selected: ['b'] })).toEqual({ ids: ['b'] });
    expect(viewInput(shown, ['a'])).toEqual({ ids: ['a'] });
  });
});
