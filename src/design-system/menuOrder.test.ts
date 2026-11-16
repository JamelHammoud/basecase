import { describe, expect, it } from 'vitest';
import type { ContextMenuEntry } from './ContextMenu';
import { arrangeMenu } from './menuOrder';

const item = (label: string): ContextMenuEntry => ({ label, onSelect: () => undefined });
const danger = (label: string): ContextMenuEntry => ({ label, tone: 'danger', onSelect: () => undefined });
const divider: ContextMenuEntry = { divider: true };

const shape = (entries: ContextMenuEntry[]) => entries.map((e) => ('label' in e ? e.label : '—'));

function previousArrangement(entries: ContextMenuEntry[]): ContextMenuEntry[] {
  const isDanger = (entry: ContextMenuEntry) => 'tone' in entry && entry.tone === 'danger';
  const rest = entries.filter((entry) => !isDanger(entry));
  const kept = rest.filter((entry, i) => !('divider' in entry) || (i > 0 && !('divider' in rest[i - 1])));
  const danger = entries.filter(isDanger);

  while (kept.length && 'divider' in kept[kept.length - 1]) kept.pop();

  if (!danger.length) return kept;

  return kept.length ? [...kept, { divider: true }, ...danger] : danger;
}

describe('arrangeMenu', () => {
  it('puts Delete last, below its own divider', () => {
    expect(shape(arrangeMenu([item('Multiply'), danger('Delete')]))).toEqual(['Multiply', '—', 'Delete']);
  });

  it('moves a Delete from the middle of the menu to its end', () => {
    const entries = [item('Annotate'), danger('Delete Marks'), item('Import'), divider, item('Export STL')];

    expect(shape(arrangeMenu(entries))).toEqual(['Annotate', 'Import', '—', 'Export STL', '—', 'Delete Marks']);
  });

  it('draws one divider where a caller already set one, and none at either end', () => {
    const entries = [divider, item('Rename'), divider, divider, item('Compare With'), divider, danger('Delete')];

    expect(shape(arrangeMenu(entries))).toEqual(['Rename', '—', 'Compare With', '—', 'Delete']);
  });

  it('leaves a menu of only Delete without a divider', () => {
    expect(shape(arrangeMenu([danger('Delete')]))).toEqual(['Delete']);
  });

  it('leaves a menu without Delete in its own order', () => {
    const entries = [item('Close'), divider, item('Close Other Scenes')];

    expect(shape(arrangeMenu(entries))).toEqual(['Close', '—', 'Close Other Scenes']);
  });

  it('preserves complete ordering and entry identities for every short menu shape', () => {
    const choices: ContextMenuEntry[] = [item('Rename'), danger('Delete'), divider, { heading: 'Parts' }];

    for (let code = 0; code < 4 ** 6; code++) {
      const entries = Array.from({ length: 6 }, (_, i) => choices[Math.floor(code / 4 ** i) % 4]);
      const original = [...entries];
      const expected = previousArrangement(entries);
      const actual = arrangeMenu(Object.freeze(entries) as ContextMenuEntry[]);

      expect(actual).toEqual(expected);
      expect(entries).toEqual(original);
    }
  });

  it('keeps the first divider across destructive entries and returns independent arrays after edits', () => {
    const first: ContextMenuEntry = { divider: true };
    const second: ContextMenuEntry = { divider: true };
    const entries = [item('Rename'), first, danger('Delete'), second, item('Duplicate')];
    const result = arrangeMenu(entries);

    expect(result[1]).toBe(first);
    expect(result[0]).toBe(entries[0]);
    expect(result[2]).toBe(entries[4]);
    expect(result[4]).toBe(entries[2]);
    entries.splice(1, 3);
    expect(shape(arrangeMenu(entries))).toEqual(['Rename', 'Duplicate']);
    expect(shape(result)).toEqual(['Rename', '—', 'Duplicate', '—', 'Delete']);
    expect(arrangeMenu([])).toEqual([]);
    expect(arrangeMenu([first, second])).toEqual([]);
  });
});
