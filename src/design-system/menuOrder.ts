import type { ContextMenuEntry } from './ContextMenu';

const isDivider = (entry: ContextMenuEntry) => 'divider' in entry;

const isDanger = (entry: ContextMenuEntry) => 'tone' in entry && entry.tone === 'danger';

export function arrangeMenu(entries: ContextMenuEntry[]): ContextMenuEntry[] {
  const rest: ContextMenuEntry[] = [];
  const danger: ContextMenuEntry[] = [];
  let pendingDivider: ContextMenuEntry | undefined;

  for (const entry of entries) {
    if (isDanger(entry)) {
      danger.push(entry);

      continue;
    }

    if (isDivider(entry)) {
      pendingDivider ??= rest.length ? entry : undefined;

      continue;
    }

    if (pendingDivider) rest.push(pendingDivider);

    pendingDivider = undefined;
    rest.push(entry);
  }

  if (!danger.length) return rest;

  if (!rest.length) return danger;

  rest.push({ divider: true });

  for (const entry of danger) rest.push(entry);

  return rest;
}
