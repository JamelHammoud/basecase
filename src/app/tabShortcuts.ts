import { shortcutFor, type ShortcutKey } from './shortcuts';

function numberedTab(e: ShortcutKey, tabIds: string[]) {
  const id = tabIds[Number(e.key) - 1];

  return id ? `tab:${id}` : null;
}

export function tabCommandForKey(e: ShortcutKey, tabIds: string[]): string | null {
  const id = shortcutFor(e, 'tabs');

  if (id === 'go-to-scene') return numberedTab(e, tabIds);

  if (id === 'last-scene') return tabIds.length > 0 ? `tab:${tabIds[tabIds.length - 1]}` : null;

  return id;
}
