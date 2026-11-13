import { describe, expect, it } from 'vitest';
import { canRunOnSelection, type SelectionFacts } from './selectionNeeds';

const facts = (selected: number, extra: Partial<SelectionFacts> = {}): SelectionFacts => ({
  selected,
  grouped: false,
  parts: Math.max(selected, 4),
  ...extra,
});

const runnable = (ids: string[], f: SelectionFacts) => ids.filter((id) => canRunOnSelection(id, f));

const SELECTION_IDS = [
  'copy',
  'cut',
  'group',
  'ungroup',
  'union',
  'subtract',
  'intersect',
  'align-left',
  'spread-x',
  'floor',
  'stack',
  'zoom-selection',
];

describe('canRunOnSelection', () => {
  it('leaves every selection command out while nothing is selected', () => {
    expect(runnable(SELECTION_IDS, facts(0))).toEqual([]);
  });

  it('offers what one part can do, like its right-click menu', () => {
    expect(runnable(SELECTION_IDS, facts(1))).toEqual([
      'copy',
      'cut',
      'subtract',
      'align-left',
      'floor',
      'stack',
      'zoom-selection',
    ]);
  });

  it('adds Group, Union and Intersect at two parts and Spread at three, without Stack', () => {
    expect(runnable(SELECTION_IDS, facts(2))).toEqual([
      'copy',
      'cut',
      'group',
      'union',
      'subtract',
      'intersect',
      'align-left',
      'floor',
      'zoom-selection',
    ]);
    expect(canRunOnSelection('spread-z', facts(3))).toBe(true);
  });

  it('offers Ungroup only when a selected part is in a group', () => {
    expect(canRunOnSelection('ungroup', facts(1, { grouped: true }))).toBe(true);
  });

  it('offers Select All while the scene has parts', () => {
    expect(canRunOnSelection('select-all', facts(0, { parts: 0 }))).toBe(false);
    expect(canRunOnSelection('select-all', facts(0, { parts: 1 }))).toBe(true);
  });

  it('keeps commands that need no selection', () => {
    expect(runnable(['paste', 'new-scene', 'export-stl'], facts(0))).toEqual(['paste', 'new-scene', 'export-stl']);
  });
});
