import { describe, expect, it } from 'vitest';
import { freshIdeas } from './market.mjs';

const idea = (title) => ({ title, kind: 'integration', body: '' });

describe('freshIdeas', () => {
  it('skips a title already open, ignoring case, spacing and a trailing period', () => {
    const ideas = [idea('Import  an Onshape document.'), idea('Export a LeRobot v3 dataset')];

    expect(freshIdeas(ideas, ['import an onshape document']).map((i) => i.title)).toEqual([
      'Export a LeRobot v3 dataset',
    ]);
  });

  it('keeps one of two ideas with the same title', () => {
    expect(freshIdeas([idea('Add a Digi-Key cart'), idea('add a digi-key cart')], [])).toHaveLength(1);
  });
});
