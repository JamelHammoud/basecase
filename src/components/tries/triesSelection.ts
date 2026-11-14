export interface TrySelection {
  ids: string[];
  anchor: string | null;
  focus: string | null;
}

export type ClickMode = 'one' | 'range' | 'toggle';

export const NO_SELECTION: TrySelection = { ids: [], anchor: null, focus: null };

const one = (id: string): TrySelection => ({ ids: [id], anchor: id, focus: id });

function range(selection: TrySelection, id: string, order: readonly string[]): TrySelection {
  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor);
  const to = order.indexOf(id);

  if (from < 0 || to < 0) return one(id);

  return { ids: order.slice(Math.min(from, to), Math.max(from, to) + 1), anchor: selection.anchor, focus: id };
}

function toggle(selection: TrySelection, id: string): TrySelection {
  if (!selection.ids.includes(id)) return { ids: [...selection.ids, id], anchor: id, focus: id };

  const ids = selection.ids.filter((s) => s !== id);
  const focus = selection.focus !== null && ids.includes(selection.focus) ? selection.focus : (ids.at(-1) ?? null);

  return { ids, anchor: id, focus };
}

export function clickTry(
  selection: TrySelection,
  click: { id: string; mode: ClickMode; order: readonly string[] },
): TrySelection {
  if (click.mode === 'range') return range(selection, click.id, click.order);

  if (click.mode === 'toggle') return toggle(selection, click.id);

  return one(click.id);
}

export const focusedTry = (selection: TrySelection) =>
  selection.focus !== null && selection.ids.includes(selection.focus) ? selection.focus : null;

export function withoutTries(selection: TrySelection, gone: readonly string[]): TrySelection {
  const goes = new Set(gone);
  const ids = selection.ids.filter((id) => !goes.has(id));

  return {
    ids,
    anchor: selection.anchor !== null && goes.has(selection.anchor) ? null : selection.anchor,
    focus: selection.focus !== null && goes.has(selection.focus) ? null : selection.focus,
  };
}
