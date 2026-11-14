import type { Dataset } from '../datasets/datasetFile';
import type { Case } from '../cases/schema';
import { caseNamed } from './agentCaseRun';
import type { Datasets, MakeDatasetInput } from './useDatasets';

type Payload = Record<string, unknown>;

export interface DatasetContext {
  cases: { cases: Case[] };
  datasets: Pick<Datasets, 'make'>;
  setAction: (action: string) => void;
}

const TRY_ID = /^[\w-]{1,128}$/;
const MAX_IDS = 10_000;

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

const refused = (problem: string) => ({ ok: false, problem });

function idsOf(raw: unknown): string[] | string | undefined {
  if (raw === undefined) return undefined;

  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_IDS) return `Pass 1 to ${MAX_IDS} try ids.`;

  const bad = raw.find((id) => typeof id !== 'string' || !TRY_ID.test(id));

  return bad === undefined ? (raw as string[]) : `${String(bad)} isn't a try id.`;
}

function sourceOf(payload: Payload): Pick<MakeDatasetInput, 'ids' | 'query'> | string {
  const query = text(payload.query);
  const ids = idsOf(payload.ids);

  if (typeof ids === 'string') return ids;

  if (query && ids) return 'Pass query or ids, not both.';

  if (query) return { query };

  return ids ? { ids } : 'Pass query (search text) or ids (try ids).';
}

function caseIdOf(payload: Payload, cases: Case[]): { caseId?: string } | string {
  const wanted = text(payload.case);

  if (!wanted) return {};

  const kase = caseNamed(cases, wanted);

  return kase ? { caseId: kase.id } : `This scene has no Case named ${wanted}.`;
}

const datasetReply = (dataset: Dataset, leftOut: number, cases: Case[]) => ({
  ok: true,
  id: dataset.id,
  name: dataset.name,
  task: dataset.task,
  case: cases.find((c) => c.id === dataset.caseId)?.name ?? null,
  tries: dataset.members.length,
  query: dataset.query,
  left_out: leftOut,
});

async function makeDataset(payload: Payload, ctx: DatasetContext) {
  const source = sourceOf(payload);
  const kase = caseIdOf(payload, ctx.cases.cases);

  if (typeof source === 'string') return refused(source);

  if (typeof kase === 'string') return refused(kase);

  ctx.setAction('Making a dataset');

  const made = await ctx.datasets.make({ ...source, ...kase, name: text(payload.name), task: text(payload.task) });

  return 'problem' in made ? refused(made.problem) : datasetReply(made.dataset, made.leftOut, ctx.cases.cases);
}

export const DATASET_HANDLERS: Record<string, (payload: Payload, ctx: DatasetContext) => Promise<unknown>> = {
  make_dataset: makeDataset,
};
