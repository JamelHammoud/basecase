import type { StoredTry } from '../cases/tryFile';
import type { TrySegment } from '../cases/tryLabels';
import { loadStoredTry } from '../cases/tryStore';
import { tryLooker, type TryLooker, type TryRequestContext } from './agentTryLook';
import { writeLabels, type TryEdit } from './agentTryLabels';

type Payload = Record<string, unknown>;

const MAX_TRIES = 20;
const SAFE_ID = /^[\w-]{1,128}$/;

const seconds = (frame: number, rate: number) => Math.round((frame / rate) * 100) / 100;

const loadTry = async (id: string): Promise<StoredTry | null> =>
  SAFE_ID.test(id) ? loadStoredTry(id).catch(() => null) : null;

function idsOf(payload: Payload): string[] {
  const ids = Array.isArray(payload.ids) ? payload.ids.filter((id): id is string => typeof id === 'string') : [];

  return [...new Set(ids)].slice(0, MAX_TRIES);
}

const editsOf = (payload: Payload): TryEdit[] =>
  (Array.isArray(payload.labels) ? (payload.labels as TryEdit[]) : [])
    .filter((e) => typeof e?.id === 'string')
    .slice(0, MAX_TRIES);

function segmentRows(segments: TrySegment[], rate: number) {
  return segments.map((s, index) => ({
    index,
    start: seconds(s.start, rate),
    end: seconds(s.end, rate),
    label: s.label,
    ...(s.instruction ? { instruction: s.instruction } : {}),
    ...(s.tags?.length ? { tags: s.tags } : {}),
  }));
}

async function segmentsOf(stored: StoredTry, look: TryLooker) {
  const kept = stored.labels?.segments;

  if (kept?.length) return { segments: kept, from: 'stored' as const };

  const ruled = await look.ruleSegments(stored);

  return ruled?.length ? { segments: ruled, from: 'rule' as const } : { segments: [], from: null };
}

async function readTry(stored: StoredTry, look: TryLooker) {
  const { segments, from } = await segmentsOf(stored, look);
  const film = await look.film(stored);
  const row = {
    id: stored.id,
    robot: stored.robot.name,
    case: stored.case?.name ?? null,
    source: stored.source,
    outcome: stored.outcome.verdict,
    seconds: Math.round(stored.seconds * 100) / 100,
    tags: stored.labels?.tags ?? [],
    instruction: stored.labels?.instruction ?? null,
    segments: segmentRows(segments, stored.rate),
    segments_from: from,
    film: !!film,
  };
  const image = film ? { view: `Try ${stored.id}: its filmstrip, start to end.`, dataUrl: film } : null;

  return { row, image };
}

async function readTries(ids: string[], look: TryLooker) {
  const tries = [];
  const images = [];
  const problems = [];

  for (const id of ids) {
    const stored = await loadTry(id);

    if (!stored) {
      problems.push(`No try ${id}.`);

      continue;
    }

    const { row, image } = await readTry(stored, look);

    tries.push(row);

    if (image) images.push(image);
  }

  return { tries, images, problems };
}

const listed = <T>(key: string, list: T[]) => (list.length ? { [key]: list } : {});

export async function labelTries(payload: Payload, ctx: TryRequestContext) {
  const ids = idsOf(payload);
  const edits = editsOf(payload);

  if (!ids.length && !edits.length) return { ok: false, problem: 'Send ids to read, labels to write, or both.' };

  const look = tryLooker(ctx);
  const { written, problems: refused } = await writeLabels(edits, loadTry, look);
  const { tries, images, problems } = await readTries(ids, look);
  const reply = {
    ...listed('tries', tries),
    ...listed('written', written),
    ...listed('problems', [...refused, ...problems]),
  };

  return { text: JSON.stringify(reply, null, 1), images, data: reply };
}

export const TRY_HANDLERS: Record<string, (payload: Payload, ctx: TryRequestContext) => Promise<unknown>> = {
  label_tries: labelTries,
};
