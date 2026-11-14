import { searchTries } from '../cases/trySearch/trySearchClient';
import type { TryHit } from '../cases/trySearch/types';

type Payload = Record<string, unknown>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const hitPayload = (hit: TryHit) => ({
  try: hit.tryId,
  label: hit.label,
  robot: hit.robot,
  scene: hit.sceneId,
  verdict: hit.verdict,
  seconds: Math.round(hit.seconds * 100) / 100,
  started: hit.startedAt,
  match: hit.match,
});

const limitOf = (value: unknown) => {
  const n = Number(value);

  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
};

export async function searchTriesRequest(payload: Payload) {
  const query = typeof payload.query === 'string' ? payload.query.trim() : '';

  if (!query) return { ok: false, problem: 'Give a query, e.g. "failed grasp red block".' };

  const hits = await searchTries(query);

  return { ok: true, count: hits.length, hits: hits.slice(0, limitOf(payload.limit)).map(hitPayload) };
}

export const TRY_HANDLERS = {
  search_tries: (payload: Payload) => searchTriesRequest(payload),
};
