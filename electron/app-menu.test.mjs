import { describe, expect, it, vi } from 'vitest';
import { menuTemplate, updateAppMenuState } from './app-menu.mjs';
import { menuAccelerator, shortcutIds } from './shortcutKeys.mjs';

vi.mock('electron', () => ({ Menu: { setApplicationMenu: () => {}, buildFromTemplate: (template) => template } }));

const itemsOf = (menu) => menu.flatMap((entry) => [entry, ...itemsOf(entry.submenu ?? [])]);

const TABS = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase() }));

describe('the app menu', () => {
  for (const isMac of [true, false]) {
    it(`reads every accelerator from the shortcut table (${isMac ? 'macOS' : 'Windows'})`, () => {
      updateAppMenuState({ tabs: TABS, activeTab: 'a' });

      const items = itemsOf(menuTemplate(isMac)).filter((entry) => entry.label && !entry.role);
      const ids = new Set(shortcutIds());
      const wrong = items.filter((entry) => ids.has(entry.id) && entry.accelerator !== menuAccelerator(entry.id));
      const stray = items.filter((entry) => entry.accelerator && !ids.has(entry.id) && !entry.id.startsWith('tab:'));

      expect(wrong.map((entry) => entry.label)).toEqual([]);
      expect(stray.map((entry) => entry.label)).toEqual([]);
    });
  }

  it('gives the first scenes their number and the last one ⌘9', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, name: `Scene ${i}` }));

    updateAppMenuState({ tabs: ten, activeTab: 't0' });

    const tabs = itemsOf(menuTemplate(true)).filter((entry) => entry.id?.startsWith('tab:'));
    const numbered = Array.from({ length: 8 }, (_, i) => `CmdOrCtrl+${i + 1}`);

    expect(tabs.map((entry) => entry.accelerator)).toEqual([...numbered, undefined, 'CmdOrCtrl+9']);
    expect(menuAccelerator('next-tab')).toBe('Shift+CmdOrCtrl+]');
    expect(menuAccelerator('delete')).toBe('Backspace');
    expect(menuAccelerator('toggle-reference-images')).toBe('Shift+I');
  });
});
