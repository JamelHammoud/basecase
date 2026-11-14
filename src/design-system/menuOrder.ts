import type { ContextMenuEntry } from './ContextMenu';

const isDivider = (entry: ContextMenuEntry) => 'divider' in entry;

const isDanger = (entry: ContextMenuEntry) => 'tone' in entry && entry.tone === 'danger';

function tidyDividers(entries: ContextMenuEntry[]): ContextMenuEntry[] {
  const kept = entries.filter((entry, i) => !isDivider(entry) || (i > 0 && !isDivider(entries[i - 1])));

  while (kept.length && isDivider(kept[0])) kept.shift();

  while (kept.length && isDivider(kept[kept.length - 1])) kept.pop();

  return kept;
}

export function arrangeMenu(entries: ContextMenuEntry[]): ContextMenuEntry[] {
  const rest = tidyDividers(entries.filter((entry) => !isDanger(entry)));
  const danger = entries.filter(isDanger);

  if (!danger.length) return rest;

  return rest.length ? [...rest, { divider: true }, ...danger] : danger;
}
