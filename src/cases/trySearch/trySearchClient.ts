import { workerClient } from '../../utils/workerRpc';
import type { StoredTry, TrySummary } from '../tryFile';
import {
  loadManifests,
  loadRecording,
  loadSearchIndex,
  loadTries,
  onTriesChanged,
  saveSearchIndex,
  updateManifests,
} from '../tryStore';
import { trySearchJobs, type TrySearchJobs } from './trySearchJobs';
import type { TryHit } from './types';

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

async function traced(stored: StoredTry) {
  const recording = await loadRecording(stored.id).catch(() => null);

  return recording && client.call('trace', { recording });
}

async function backfillBatch(tries: StoredTry[], summaries: Map<string, TrySummary>) {
  const moved: StoredTry[] = [];
  const still: StoredTry[] = [];

  for (const stored of tries) {
    const motion = await traced(stored);

    if (motion) moved.push({ ...stored, motion });
    else still.push(stored);
  }

  const current = new Map((await loadManifests(tries.map((t) => t.id))).map((t) => [t.id, t]));
  const kept = still.filter((t) => current.has(t.id));

  await updateManifests(moved.filter((t) => current.has(t.id) && !current.get(t.id)?.motion));
  await client.call('put', { tries: kept, stamps: stampsOf(kept, (id) => summaries.get(id)?.stamp ?? SESSION_STAMP) });
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
