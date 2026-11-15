import { useEffect, useEffectEvent, useRef } from 'react';
import type { Case } from '../cases/schema';
import type { TrySummary } from '../cases/tryFile';
import { hitKey } from '../cases/trySearch/hitSelection';
import { searchTries } from '../cases/trySearch/trySearchClient';
import { addMembers, newDataset, withMembers, type Dataset, type DatasetSample } from '../datasets/datasetFile';
import { deleteDatasets, saveDataset } from '../datasets/datasetStore';
import { imageCount } from '../datasets/datasetView';
import { useVisionTraining, type VisionTraining } from '../vision/training/useVisionTraining';
import { confirmAction } from '../design-system/confirmStore';
import { errorMessage } from '../utils/errorMessage';
import { plural } from '../../electron/plural.mjs';
import { newId } from './helpers';
import type { ShowToast } from './types';
import type { Cases } from './useCases';
import type { SimTraining } from './useSimTraining';
import { useTriesView, type TriesView } from './useTriesView';

export interface MakeDatasetInput {
  ids?: string[];
  samples?: DatasetSample[];
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
  vision: VisionTraining;
}

function commonCase(members: TrySummary[], cases: Cases): Case | null {
  const counts = new Map<string, number>();

  for (const m of members) if (m.caseId) counts.set(m.caseId, (counts.get(m.caseId) ?? 0) + 1);

  if (cases.active && counts.has(cases.active.id)) return cases.active;

  const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  return ranked.map((id) => cases.cases.find((c) => c.id === id)).find(Boolean) ?? null;
}

const DATASET_TRIES = 100_000;

const sampleOf = ({ tryId, from, to }: DatasetSample): DatasetSample =>
  from === undefined ? { tryId } : { tryId, from, to };

const searchedSamples = async (query: string) => (await searchTries(query, DATASET_TRIES)).map(sampleOf);

export async function datasetMembers(input: MakeDatasetInput, all: TrySummary[]) {
  const byId = new Map(all.map((t) => [t.id, t]));
  const query = input.query?.trim();
  const samples = query
    ? await searchedSamples(query)
    : (input.samples ?? (input.ids ?? []).map((tryId) => ({ tryId })));
  const unique = [...new Map(samples.map((sample) => [hitKey(sample), sample])).values()];
  const ids = [...new Set(unique.map((sample) => sample.tryId))];
  const members = ids.flatMap((id) => byId.get(id) ?? []);

  return {
    members,
    samples: unique.filter((sample) => byId.has(sample.tryId)),
    leftOut: query ? 0 : ids.length - members.length,
  };
}

type ShownTries = Pick<TriesView, 'selected' | 'order' | 'query' | 'searching'> & {
  hits: DatasetSample[] | null;
};

export function viewInput(view: ShownTries, ids?: string[]): MakeDatasetInput {
  const chosen = ids ?? (view.selected.length ? view.selected : null);

  if (chosen && view.searching)
    return { ids: chosen, samples: (view.hits ?? []).filter((hit) => chosen.includes(hit.tryId)).map(sampleOf) };

  if (chosen) return { ids: chosen };

  return view.searching ? { query: view.query.trim() } : { ids: view.order };
}

const caseTask = (kase: Case | null, name: string) => (kase ? kase.brief.trim() || kase.name : name);

const chosenCase = (input: MakeDatasetInput, members: TrySummary[], cases: Cases) =>
  input.caseId ? (cases.cases.find((c) => c.id === input.caseId) ?? null) : commonCase(members, cases);

const nameOf = (input: MakeDatasetInput, kase: Case | null, first: TrySummary) =>
  input.name?.trim() || kase?.name || input.query?.trim() || first.caseName || first.robot;

async function built(input: MakeDatasetInput, all: TrySummary[], cases: Cases): Promise<MadeDataset> {
  const { members, samples, leftOut } = await datasetMembers(input, all);

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
    samples,
    at: new Date().toISOString(),
  });

  return { dataset, leftOut };
}

export function useWorkspaceDatasets({ view, cases, showToast, vision }: DatasetsOptions) {
  const failed = (e: unknown) => showToast(errorMessage(e), { tone: 'error' });
  const caseFor = (dataset: Dataset) => cases.cases.find((c) => c.id === dataset.caseId) ?? null;

  const open = (dataset: Dataset) => {
    const kase = caseFor(dataset);

    if (kase && cases.active?.id !== kase.id) cases.open(kase.id);

    view.openDataset(dataset.id);
  };

  const make = async (input: MakeDatasetInput): Promise<MadeDataset> => {
    const made = await built(input, view.all, cases);

    if ('problem' in made) return made;

    await saveDataset(made.dataset);
    open(made.dataset);

    return made;
  };

  const perform = (dataset: Dataset, act: Act, onNoCase: () => void) => {
    const kase = dataset.caseId ? caseFor(dataset) : cases.active;

    if (act === 'export') return cases.dataset.exportDataset(dataset);

    if (act === 'publish') return cases.dataset.publishDataset(dataset);

    if (imageCount(dataset) > 0) return vision.train(dataset);

    if (kase) cases.fromTries.train(dataset, kase);
    else onNoCase();
  };

  const pending = useRef<{ dataset: Dataset; act: Act; onNoCase: () => void } | null>(null);
  const activeId = cases.active?.id ?? null;
  const runPending = useEffectEvent(() => {
    const job = pending.current;

    if (!job || job.dataset.caseId !== activeId) return;

    pending.current = null;
    perform(job.dataset, job.act, job.onNoCase);
  });

  useEffect(() => {
    runPending();
  }, [activeId]);

  const withCase = (dataset: Dataset, act: Act, onNoCase: () => void) => {
    if (act === 'train' && imageCount(dataset) > 0) return perform(dataset, act, onNoCase);

    const kase = caseFor(dataset);

    if (!kase || cases.active?.id === kase.id) return perform(dataset, act, onNoCase);

    pending.current = { dataset, act, onNoCase };
    cases.open(kase.id);
  };

  return {
    list: view.datasets,
    vision,
    make,
    open,
    makeFromView: (ids?: string[]) => {
      make(viewInput(view, ids)).then(
        (made) => 'problem' in made && showToast(made.problem, { tone: 'error' }),
        failed,
      );
    },
    add: (dataset: Dataset, ids: string[]) => {
      const next = addMembers(dataset, ids, viewInput(view, ids).samples);
      const added = next.members.length - dataset.members.length;

      saveDataset(next).then(() => showToast(`Added ${plural(added, 'try', 'tries')} to ${dataset.name}`), failed);
    },
    update: (dataset: Dataset) => {
      if (!dataset.query) return;

      searchedSamples(dataset.query)
        .then((samples) =>
          saveDataset(withMembers(dataset, [...new Set(samples.map((sample) => sample.tryId))], samples)),
        )
        .catch(failed);
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
  const vision = useVisionTraining({ datasetId: triesView.dataset?.id ?? null, showToast });
  const datasets = useWorkspaceDatasets({ view: triesView, cases, showToast, vision });

  return { triesView, datasets };
}
