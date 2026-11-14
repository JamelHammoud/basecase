import { useState } from 'react';
import { summaryRecord, type TrySummary } from '../cases/tryFile';
import { goingWith } from '../cases/tries';
import { deleteTries, useTries } from '../cases/tryStore';
import { tryMatches } from '../cases/tryQuery';
import type { Dataset } from '../datasets/datasetFile';
import { useDatasets } from '../datasets/datasetStore';
import { confirmAction } from '../design-system/confirmStore';
import { plural } from '../../electron/plural.mjs';
import { errorMessage } from '../utils/errorMessage';
import type { ShowToast } from './types';
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

export interface TriesPlace {
  open: boolean;
  robot: string | null;
  dataset: string | null;
}

const CLOSED: TriesPlace = { open: false, robot: null, dataset: null };

export function useTriesPlace() {
  const [place, setPlace] = useState<TriesPlace>(CLOSED);

  return { place, setPlace, showDataset: (id: string) => setPlace({ open: true, robot: null, dataset: id }) };
}

type Places = ReturnType<typeof useTriesPlace>;

interface TriesViewOptions {
  places: Places;
  timeline: TryTimeline;
  showToast: ShowToast;
}

const datasetGroups = (dataset: Dataset, all: TrySummary[]) => {
  const byId = new Map(all.map((t) => [t.id, t]));

  return tryGroups(dataset.members.flatMap((id) => byId.get(id) ?? []));
};

export function useTriesView({ places, timeline, showToast }: TriesViewOptions) {
  const all = useTries() ?? [];
  const datasets = useDatasets() ?? [];
  const { place, setPlace } = places;
  const { open, robot } = place;
  const dataset = (place.dataset && datasets.find((d) => d.id === place.dataset)) || null;
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState<{ selected: string[]; anchor: string | null }>({ selected: [], anchor: null });
  const groups = dataset ? datasetGroups(dataset, all) : tryGroups(all.filter(tryMatches(query)));
  const order = groups.flatMap((g) => g.tries.map((t) => t.id));
  const selected = pick.selected.filter((id) => order.includes(id));

  const show = (id: string) => {
    const summary = all.find((t) => t.id === id);

    if (summary?.recording && summary.source !== 'real') void timeline.show(summaryRecord(summary)).catch(() => {});
  };

  const close = () => {
    if (timeline.open) timeline.close();

    setPlace(CLOSED);
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
        deleteTries(going).catch((e: unknown) => showToast(errorMessage(e), { tone: 'error' }));
      },
    });
  };

  return {
    open,
    robot,
    groups,
    selected,
    order,
    all,
    query,
    setQuery,
    dataset,
    datasets,
    openFor: (name: string | null) => {
      setPick({ selected: [], anchor: null });
      setPlace({ open: true, robot: name, dataset: null });
    },
    openDataset: (id: string) => {
      setPick({ selected: [], anchor: null });
      setPlace({ open: true, robot: null, dataset: id });
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
