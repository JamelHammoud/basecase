import { useState } from 'react';
import { summaryRecord, type TrySummary } from '../cases/tryFile';
import { goingWith } from '../cases/tries';
import { deleteTries, useTries } from '../cases/tryStore';
import { confirmAction } from '../design-system/confirmStore';
import { plural } from '../../electron/plural.mjs';
import type { TryTimeline } from './useTryTimeline';

export interface TryGroup {
  robot: string;
  tries: TrySummary[];
}

export interface PickKeys {
  shift: boolean;
  toggle: boolean;
}

const newestFirst = (a: TrySummary, b: TrySummary) => b.startedAt.localeCompare(a.startedAt);

export function tryGroups(tries: TrySummary[]): TryGroup[] {
  const groups = new Map<string, TrySummary[]>();

  for (const t of [...tries].sort(newestFirst)) groups.set(t.robot, [...(groups.get(t.robot) ?? []), t]);

  return [...groups].map(([robot, list]) => ({ robot, tries: list })).sort((a, b) => a.robot.localeCompare(b.robot));
}

export function picked(
  order: string[],
  current: { selected: string[]; anchor: string | null },
  id: string,
  keys: PickKeys,
) {
  if (keys.shift && current.anchor && order.includes(current.anchor)) {
    const [from, to] = [order.indexOf(current.anchor), order.indexOf(id)].sort((a, b) => a - b);

    return { selected: order.slice(from, to + 1), anchor: current.anchor };
  }

  if (keys.toggle) {
    const has = current.selected.includes(id);

    return { selected: has ? current.selected.filter((s) => s !== id) : [...current.selected, id], anchor: id };
  }

  return { selected: [id], anchor: id };
}

export const goingTries = (all: TrySummary[], ids: string[]) => {
  const going = goingWith(ids);

  return all.filter((t) => going(t.id, t.source === 'generated' ? t.sourceTry : null)).map((t) => t.id);
};

export function useTriesView(timeline: TryTimeline) {
  const all = useTries() ?? [];
  const [open, setOpen] = useState(false);
  const [robot, setRobot] = useState<string | null>(null);
  const [pick, setPick] = useState<{ selected: string[]; anchor: string | null }>({ selected: [], anchor: null });
  const groups = tryGroups(all);
  const order = groups.flatMap((g) => g.tries.map((t) => t.id));
  const selected = pick.selected.filter((id) => order.includes(id));

  const show = (id: string) => {
    const summary = all.find((t) => t.id === id);

    if (summary?.recording && summary.source !== 'real') void timeline.show(summaryRecord(summary)).catch(() => {});
  };

  const close = () => {
    if (timeline.open) timeline.close();

    setOpen(false);
    setPick({ selected: [], anchor: null });
  };

  const remove = (ids: string[]) => {
    const going = goingTries(all, ids);

    if (!going.length) return;

    confirmAction({
      title: going.length > 1 ? `Delete ${plural(going.length, 'try', 'tries')}?` : 'Delete this try?',
      onConfirm: () => {
        if (timeline.record && going.includes(timeline.record.id)) timeline.close();

        setPick((p) => ({ selected: p.selected.filter((id) => !going.includes(id)), anchor: null }));
        void deleteTries(going);
      },
    });
  };

  return {
    open,
    robot,
    groups,
    selected,
    openFor: (name: string | null) => {
      setRobot(name);
      setOpen(true);
    },
    close,
    pick: (id: string, keys: PickKeys) => {
      const next = picked(order, pick, id, keys);

      setPick(next);

      if (next.selected.includes(id)) show(id);
    },
    remove: (id?: string) => remove(id && !selected.includes(id) ? [id] : selected),
  };
}

export type TriesView = ReturnType<typeof useTriesView>;
