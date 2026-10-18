export interface TabKey {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const BRACKET_COMMANDS = new Map([
  ['BracketRight', 'next-tab'],
  ['BracketLeft', 'prev-tab'],
]);

function numberedTabCommand(key: string, tabIds: string[]): string | null {
  if (!/^[1-9]$/.test(key)) return null;

  const id = key === '9' ? tabIds[tabIds.length - 1] : tabIds[Number(key) - 1];

  return id ? `tab:${id}` : null;
}

export function tabCommandForKey(e: TabKey, tabIds: string[]): string | null {
  if (e.ctrlKey && e.key === 'Tab') return e.shiftKey ? 'prev-tab' : 'next-tab';

  if (!e.metaKey && !e.ctrlKey) return null;

  const bracket = e.shiftKey ? BRACKET_COMMANDS.get(e.code) : undefined;

  if (bracket) return bracket;

  if (e.altKey) return null;

  const key = e.key.toLowerCase();

  if (key === 't') return e.shiftKey ? 'reopen-tab' : 'new-scene';

  if (e.shiftKey) return null;

  if (key === 'w') return 'close-tab';

  return numberedTabCommand(e.key, tabIds);
}
