import { describe, expect, it } from 'vitest';
import { addMembers, newDataset, readDataset } from './datasetFile';

const dataset = () => newDataset({ id: 'dataset', name: 'Grasps', task: 'Grasp', members: ['whole'], at: 'now' });

describe('adding exact dataset samples', () => {
  it('adds a searched segment without expanding its frames or narrowing an existing whole try', () => {
    const samples = [
      { tryId: 'whole', from: 5, to: 10 },
      { tryId: 'new', from: 20, to: 40 },
    ];
    const added = addMembers(dataset(), ['whole', 'new'], samples);

    expect(added.members).toEqual(['whole', 'new']);
    expect(added.samples).toEqual([{ tryId: 'whole' }, { tryId: 'new', from: 20, to: 40 }]);
    expect(readDataset(added)).toEqual(added);
  });

  it('retains existing segments and merges repeated range selections once', () => {
    const first = addMembers(dataset(), ['new'], [{ tryId: 'new', from: 20, to: 40 }]);
    const next = addMembers(
      first,
      ['new'],
      [
        { tryId: 'new', from: 20, to: 40 },
        { tryId: 'new', from: 60, to: 80 },
      ],
    );

    expect(next.samples).toEqual([
      { tryId: 'whole' },
      { tryId: 'new', from: 20, to: 40 },
      { tryId: 'new', from: 60, to: 80 },
    ]);
    expect(addMembers(next, ['new']).samples).toEqual([{ tryId: 'whole' }, { tryId: 'new' }]);
  });
});
