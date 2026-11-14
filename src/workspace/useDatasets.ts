import { useLayoutEffect, useRef } from 'react';
import type { Case } from '../cases/schema';
import type { TrySummary } from '../cases/tryFile';
import { tryMatches } from '../cases/tryQuery';
import { addMembers, newDataset, withMembers, type Dataset } from '../datasets/datasetFile';
import { deleteDatasets, saveDataset } from '../datasets/datasetStore';
import { confirmAction } from '../design-system/confirmStore';
import { errorMessage } from '../utils/errorMessage';
import { plural } from '../../electron/plural.mjs';
import { newId } from './helpers';
import type { ShowToast } from './types';
import type { Cases } from './useCases';
import type { SimTraining } from './useSimTraining';
import { tryGroups, useTriesView, type TriesView } from './useTriesView';

export interface MakeDatasetInput {
  ids?: string[];
  query?: string;
  name?: string;
  task?: string;
  caseId?: string;
}

export type MadeDataset = { dataset: Dataset; leftOut: number } | { problem: string };

type Act = 'export' | 'publish' | 'train';

interface DatasetsOptions {
  view: TriesView;
  cases: Cases;
  showToast: ShowToast;
}

function commonCase(members: TrySummary[], cases: Cases): Case | null {
  const counts = new Map<string, number>();

  for (const m of members) if (m.caseId) counts.set(m.caseId, (counts.get(m.caseId) ?? 0) + 1);

  if (cases.active && counts.has(cases.active.id)) return cases.active;

  const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  return ranked.map((id) => cases.cases.find((c) => c.id === id)).find(Boolean) ?? null;
}

const allInOrder = (all: TrySummary[]) => tryGroups(all).flatMap((g) => g.tries);

function membersFor(input: MakeDatasetInput, all: TrySummary[]) {
  const ordered = allInOrder(all);

  if (input.query?.trim()) return { members: ordered.filter(tryMatches(input.query)), leftOut: 0 };

  const byId = new Map(all.map((t) => [t.id, t]));
  const members = [...new Set(input.ids ?? [])].flatMap((id) => byId.get(id) ?? []);

  return { members, leftOut: (input.ids?.length ?? 0) - members.length };
}

const caseTask = (kase: Case | null, name: string) => (kase ? kase.brief.trim() || kase.name : name);

const chosenCase = (input: MakeDatasetInput, members: TrySummary[], cases: Cases) =>
  input.caseId ? (cases.cases.find((c) => c.id === input.caseId) ?? null) : commonCase(members, cases);

const nameOf = (input: MakeDatasetInput, kase: Case | null, first: TrySummary) =>
  input.name?.trim() || kase?.name || input.query?.trim() || first.caseName || first.robot;

function built(input: MakeDatasetInput, all: TrySummary[], cases: Cases): MadeDataset {
  const { members, leftOut } = membersFor(input, all);

  if (!members.length) return { problem: input.query ? `No tries match ${input.query}.` : 'No tries have these ids.' };

  const kase = chosenCase(input, members, cases);
  const name = nameOf(input, kase, members[0]);
  const dataset = newDataset({
    id: newId('dataset'),
    name,
    task: input.task?.trim() || caseTask(kase, name),
    sceneId: cases.sceneId,
    caseId: kase?.id ?? null,
    query: input.query ?? null,
    members: members.map((m) => m.id),
    at: new Date().toISOString(),
  });

  return { dataset, leftOut };
}

export function useWorkspaceDatasets({ view, cases, showToast }: DatasetsOptions) {
  const failed = (e: unknown) => showToast(errorMessage(e), { tone: 'error' });
  const caseFor = (dataset: Dataset) => cases.cases.find((c) => c.id === dataset.caseId) ?? null;

  const open = (dataset: Dataset) => {
    const kase = caseFor(dataset);

    if (kase && cases.active?.id !== kase.id) cases.open(kase.id);

    view.openDataset(dataset.id);
  };

  const make = async (input: MakeDatasetInput): Promise<MadeDataset> => {
    const made = built(input, view.all, cases);

    if ('problem' in made) return made;

    await saveDataset(made.dataset);
    open(made.dataset);

    return made;
  };

  const perform = (dataset: Dataset, act: Act, onNoCase: () => void) => {
    const kase = caseFor(dataset) ?? cases.active;

    if (act === 'export') return cases.dataset.exportDataset(dataset);

    if (act === 'publish') return cases.dataset.publishDataset(dataset);

    if (kase) cases.fromTries.train(dataset, kase);
    else onNoCase();
  };

  const latest = useRef(perform);

  useLayoutEffect(() => {
    latest.current = perform;
  });

  const withCase = (dataset: Dataset, act: Act, onNoCase: () => void) => {
    const kase = caseFor(dataset);

    if (!kase || cases.active?.id === kase.id) return perform(dataset, act, onNoCase);

    cases.open(kase.id);
    setTimeout(() => latest.current(dataset, act, onNoCase), 0);
  };

  return {
    list: view.datasets,
    make,
    open,
    makeFromView: (ids?: string[]) => {
      const chosen = ids ?? (view.selected.length ? view.selected : null);
      const query = view.query.trim();
      const input = chosen ? { ids: chosen } : { ids: view.order, ...(query ? { query } : {}) };

      make(input).then((made) => 'problem' in made && showToast(made.problem, { tone: 'error' }), failed);
    },
    add: (dataset: Dataset, ids: string[]) => {
      const next = addMembers(dataset, ids);
      const added = next.members.length - dataset.members.length;

      saveDataset(next).then(() => showToast(`Added ${plural(added, 'try', 'tries')} to ${dataset.name}`), failed);
    },
    update: (dataset: Dataset) => {
      if (!dataset.query) return;

      const ids = allInOrder(view.all)
        .filter(tryMatches(dataset.query))
        .map((t) => t.id);

      saveDataset(withMembers(dataset, ids)).catch(failed);
    },
    remove: (dataset: Dataset) =>
      confirmAction({
        title: `Delete ${dataset.name}?`,
        onConfirm: () => {
          if (view.dataset?.id === dataset.id) view.close();

          deleteDatasets([dataset.id]).catch(failed);
        },
      }),
    exportDataset: (dataset: Dataset) => withCase(dataset, 'export', () => {}),
    publishDataset: (dataset: Dataset) => withCase(dataset, 'publish', () => {}),
    train: (dataset: Dataset, onNoCase: () => void) => withCase(dataset, 'train', onNoCase),
  };
}

export type Datasets = ReturnType<typeof useWorkspaceDatasets>;

export function useTriesWork(simTraining: SimTraining, showToast: ShowToast) {
  const { cases, triesPlaces } = simTraining;
  const triesView = useTriesView({ places: triesPlaces, timeline: cases.timeline, showToast });
  const datasets = useWorkspaceDatasets({ view: triesView, cases, showToast });

  return { triesView, datasets };
}
