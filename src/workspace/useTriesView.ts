import { useState } from 'react';
import { summaryRecord, type TrySummary } from '../cases/tryFile';
import { goingWith } from '../cases/tries';
import { canMark } from '../cases/tryLabels';
import { deleteTries, useTries } from '../cases/tryStore';
import type { Dataset } from '../datasets/datasetFile';
import { useDatasets } from '../datasets/datasetStore';
import { confirmAction } from '../design-system/confirmStore';
import { plural } from '../../electron/plural.mjs';
import { errorMessage } from '../utils/errorMessage';
import type { ShowToast } from './types';
import type { TryTimeline } from './useTryTimeline';
import type { TryHit } from '../cases/trySearch/types';
import { distinctTries } from '../cases/trySearch/hitSelection';
import { likeQuery, useTrySearch } from './useTrySearch';
import { markTries } from './tagTries';
import { datasetVersionMembers, selectedDataset } from './datasetVersionView';

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
  const groups = new Map<string, TryGroup & { newestIndex: number }>();

  for (let index = 0; index < tries.length; index++) {
    const t = tries[index];
    const group = groups.get(t.robot);

    if (!group) {
      groups.set(t.robot, { robot: t.robot, tries: [t], newestIndex: index });

      continue;
    }

    if (newestFirst(t, tries[group.newestIndex]) < 0) group.newestIndex = index;

    group.tries.push(t);
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        a.robot.localeCompare(b.robot) ||
        newestFirst(tries[a.newestIndex], tries[b.newestIndex]) ||
        a.newestIndex - b.newestIndex,
    )
    .map(({ robot, tries: list }) => ({ robot, tries: list.sort(newestFirst) }));
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

export const hitOrder = (hits: TryHit[]) => distinctTries(hits).map((h) => h.tryId);

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

const datasetGroups = (dataset: Dataset, all: TrySummary[]) => tryGroups(datasetVersionMembers(dataset, all));

const groupOrder = (groups: TryGroup[]) => groups.flatMap((g) => g.tries.map((t) => t.id));

export function useTriesView({ places, timeline, showToast }: TriesViewOptions) {
  const all = useTries() ?? [];
  const datasets = useDatasets() ?? [];
  const { place, setPlace } = places;
  const { open, robot } = place;
  const workingDataset = (place.dataset && datasets.find((d) => d.id === place.dataset)) || null;
  const [version, setVersion] = useState<{ dataset: string; n: number } | null>(null);
  const dataset = selectedDataset(
    workingDataset,
    version?.dataset === workingDataset?.id ? (version?.n ?? null) : null,
  );
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState<{ selected: string[]; anchor: string | null }>({ selected: [], anchor: null });
  const hits = useTrySearch(query);
  const searching = !dataset && query.trim() !== '';
  const groups = dataset ? datasetGroups(dataset, all) : tryGroups(all);
  const order = searching ? hitOrder(hits ?? []) : groupOrder(groups);
  const selected = pick.selected.filter((id) => order.includes(id));

  const show = (id: string) => {
    if (dataset?.selectedVersion) return;

    const summary = all.find((t) => t.id === id);

    if (summary?.recording && summary.source !== 'real') void timeline.show(summaryRecord(summary)).catch(() => {});
  };

  const close = () => {
    if (timeline.open) timeline.close();

    setPlace(CLOSED);
    setVersion(null);
    setQuery('');
    setPick({ selected: [], anchor: null });
  };

  const remove = (ids: string[]) => {
    if (dataset?.selectedVersion) return;

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

  const targets = (id: string) => (selected.includes(id) ? selected : [id]);
  const fail = (e: unknown) => showToast(errorMessage(e), { tone: 'error' });

  return {
    open,
    robot,
    groups,
    query,
    hits,
    selected,
    order,
    all,
    searching,
    setQuery,
    dataset,
    datasets,
    selectVersion: (n: number | null) => {
      if (timeline.open) timeline.close();

      setPick({ selected: [], anchor: null });
      setVersion(workingDataset && n !== null ? { dataset: workingDataset.id, n } : null);
    },
    openFor: (name: string | null) => {
      setPick({ selected: [], anchor: null });
      setQuery('');
      setPlace({ open: true, robot: name, dataset: null });
    },
    openDataset: (id: string) => {
      setVersion(null);
      setPick({ selected: [], anchor: null });
      setQuery('');
      setPlace({ open: true, robot: null, dataset: id });
    },
    openAt: (text: string, tryId: string) => {
      setQuery(text);
      setPlace({ open: true, robot: null, dataset: null });
      setPick({ selected: [tryId], anchor: tryId });
      show(tryId);
    },
    close,
    pick: (id: string, keys: PickKeys, shown = order) => {
      const next = picked(shown, pick, id, keys);

      setPick(next);

      if (next.selected.includes(id)) show(id);
    },
    like: (tryId: string) => setQuery(likeQuery(tryId)),
    remove: (id?: string) => remove(id && !selected.includes(id) ? [id] : selected),
    targets,
    fail,
    markable: (id: string) =>
      !dataset?.selectedVersion && targets(id).every((t) => all.some((s) => s.id === t && canMark(s))),
    mark: (id: string, verdict: 'passed' | 'failed') => void markTries(targets(id), verdict).catch(fail),
  };
}

export type TriesView = ReturnType<typeof useTriesView>;
