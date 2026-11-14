import { describe, expect, it } from 'vitest';
import type { ContextMenuEntry } from './ContextMenu';
import { arrangeMenu } from './menuOrder';

const item = (label: string): ContextMenuEntry => ({ label, onSelect: () => undefined });
const danger = (label: string): ContextMenuEntry => ({ label, tone: 'danger', onSelect: () => undefined });
const divider: ContextMenuEntry = { divider: true };

const shape = (entries: ContextMenuEntry[]) => entries.map((e) => ('label' in e ? e.label : '—'));

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
});
