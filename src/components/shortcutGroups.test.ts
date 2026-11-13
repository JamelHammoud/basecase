import { describe, expect, it } from 'vitest';
import { SHORTCUT_GROUPS } from './shortcutGroups';

const ARTICLE = import.meta.glob<string>('../../site/content/help/keyboard-shortcuts.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})['../../site/content/help/keyboard-shortcuts.md'];

const isActionRow = (line: string) => line.startsWith('| ') && !line.startsWith('| Action ');

function articleGroups(markdown: string) {
  const groups: Array<{ title: string; actions: string[] }> = [];

  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) groups.push({ title: line.slice(3).trim(), actions: [] });
    else if (isActionRow(line)) groups.at(-1)?.actions.push(line.split('|')[1].trim());
  }

  return groups;
}

describe('the Shortcuts pane', () => {
  it('lists the same shortcuts, under the same names, as the Keyboard shortcuts article', () => {
    const pane = SHORTCUT_GROUPS.map((g) => ({ title: g.title, actions: g.rows.map(([label]) => label) }));

    expect(articleGroups(ARTICLE)).toEqual(pane);
  });
});
