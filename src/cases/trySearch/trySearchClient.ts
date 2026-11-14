import { workerClient } from '../../utils/workerRpc';
import type { StoredTry, TrySummary } from '../tryFile';
import {
  loadManifests,
  loadRecordingBytes,
  loadSearchIndex,
  loadTries,
  onTriesChanged,
  saveSearchIndex,
  updateManifests,
} from '../tryStore';
import { trySearchJobs, type TrySearchJobs } from './trySearchJobs';
import type { MotionTrace, TryHit } from './types';

const BATCH = 200;
const SAVE_AFTER_MS = 2000;
const SESSION_STAMP = -1;

export const SEARCH_LIMIT = 200;

let localJobs: TrySearchJobs | null = null;

const client = workerClient<TrySearchJobs>(
  () => new Worker(new URL('./trySearch.worker.ts', import.meta.url), { type: 'module' }),
  async () => (localJobs ??= trySearchJobs()),
);

let ready: Promise<void> | null = null;
let saving: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const changed = () => listeners.forEach((listener) => listener());

export function onSearchChanged(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function saveSoon() {
  if (saving) clearTimeout(saving);

  saving = setTimeout(() => {
    saving = null;
    void client
      .call('snapshot', undefined as never)
      .then(saveSearchIndex)
      .catch(() => {});
  }, SAVE_AFTER_MS);
}

const stampsOf = (tries: StoredTry[], stamp: (id: string) => number) =>
  Object.fromEntries(tries.map((t) => [t.id, stamp(t.id)]));

const needsMotion = (stored: StoredTry, summaries: Map<string, TrySummary>) =>
  !stored.motion && !!summaries.get(stored.id)?.recording;

async function traced(id: string): Promise<MotionTrace | null> {
  const bytes = await loadRecordingBytes(id).catch(() => null);

  return bytes && client.call('trace', { bytes }, [bytes.buffer]).catch(() => null);
}

async function backfillBatch(tries: StoredTry[], summaries: Map<string, TrySummary>) {
  const traces = new Map<string, MotionTrace>();

  for (const stored of tries) {
    const motion = await traced(stored.id);

    if (motion) traces.set(stored.id, motion);
  }

  const current = new Map((await loadManifests(tries.map((t) => t.id))).map((t) => [t.id, t]));
  const moved = [...traces].flatMap(([id, motion]) => {
    const now = current.get(id);

    return now && !now.motion ? [{ ...now, motion }] : [];
  });
  const untraced = [...current.values()].filter((t) => !traces.has(t.id));

  await updateManifests(moved);
  await client.call('put', {
    tries: untraced,
    stamps: stampsOf(untraced, (id) => summaries.get(id)?.stamp ?? SESSION_STAMP),
  });
}

async function backfillMotion(tries: StoredTry[], summaries: Map<string, TrySummary>) {
  const pending = tries.filter((t) => needsMotion(t, summaries));

  for (let i = 0; i < pending.length; i += BATCH) await backfillBatch(pending.slice(i, i + BATCH), summaries);

  if (pending.length) saveSoon();
}

async function fetchWanted(wanted: string[], summaries: Map<string, TrySummary>) {
  const fetched: StoredTry[] = [];
  const stamp = (stored: StoredTry) =>
    needsMotion(stored, summaries) ? SESSION_STAMP : (summaries.get(stored.id)?.stamp ?? SESSION_STAMP);

  for (let i = 0; i < wanted.length; i += BATCH) {
    const tries = await loadManifests(wanted.slice(i, i + BATCH));

    await client.call('put', { tries, stamps: Object.fromEntries(tries.map((t) => [t.id, stamp(t)])) });
    fetched.push(...tries);
  }

  return fetched;
}

async function sync() {
  await client.call('load', { snapshot: await loadSearchIndex().catch(() => null) });

  const summaries = new Map((await loadTries()).map((t) => [t.id, t]));
  const stamps = Object.fromEntries([...summaries].map(([id, t]) => [id, t.stamp ?? null]));
  const { wanted, gone } = await client.call('plan', { stamps });

  if (gone.length) await client.call('remove', { ids: gone });

  const fetched = await fetchWanted(wanted, summaries);

  if (wanted.length || gone.length) saveSoon();

  void backfillMotion(fetched, summaries).catch(() => {});
}

function follow() {
  onTriesChanged(({ kept, deleted }) => {
    void (async () => {
      await ready;

      if (kept.length) await client.call('put', { tries: kept, stamps: stampsOf(kept, () => SESSION_STAMP) });

      if (deleted.length) await client.call('remove', { ids: deleted });

      saveSoon();
      changed();
    })();
  });
}

export function syncSearch(): Promise<void> {
  if (!ready) {
    follow();
    ready = sync().catch(() => {});
  }

  return ready;
}

export async function searchTries(text: string): Promise<TryHit[]> {
  await syncSearch();

  return client.call('search', { text, now: Date.now(), limit: SEARCH_LIMIT });
}
