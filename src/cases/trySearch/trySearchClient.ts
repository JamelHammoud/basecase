import { workerClient } from '../../utils/workerRpc';
import type { StoredTry, TrySummary } from '../tryFile';
import {
  loadManifests,
  loadRecording,
  loadSearchIndex,
  loadTries,
  onTriesChanged,
  saveManifest,
  saveSearchIndex,
} from '../tryStore';
import { embedText } from './clip/clipClient';
import { motionTrace } from './motion';
import { trySearchJobs, type TrySearchJobs } from './trySearchJobs';
import type { FrameVector, TryHit } from './types';

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
let framed = false;
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

async function backfillMotion(tries: StoredTry[], summaries: Map<string, TrySummary>) {
  for (const stored of tries) {
    if (stored.motion || !summaries.get(stored.id)?.recording) continue;

    const recording = await loadRecording(stored.id).catch(() => null);
    const motion = recording && motionTrace(recording);

    if (!motion) continue;

    const [current] = await loadManifests([stored.id]).catch(() => []);

    if (current && !current.motion) await saveManifest({ ...current, motion }).catch(() => {});
  }
}

async function fetchWanted(wanted: string[], summaries: Map<string, TrySummary>) {
  const fetched: StoredTry[] = [];

  for (let i = 0; i < wanted.length; i += BATCH) {
    const tries = await loadManifests(wanted.slice(i, i + BATCH));

    await client.call('put', { tries, stamps: stampsOf(tries, (id) => summaries.get(id)?.stamp ?? SESSION_STAMP) });
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

  framed = await client.call('framed', undefined as never);

  if (wanted.length || gone.length) saveSoon();

  void backfillMotion(fetched, summaries);
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

export interface FrameSource {
  sceneId: string;
  frames: (tryId: string) => Promise<FrameVector[] | null>;
}

const frameSources = new Set<FrameSource>();
const framesTried = new Set<string>();
let feeding: Promise<void> | null = null;

export function registerFrameSource(source: FrameSource) {
  frameSources.add(source);

  return () => {
    frameSources.delete(source);
  };
}

async function feedSource(source: FrameSource) {
  const ids = (await loadTries()).filter((t) => t.sceneId === source.sceneId && t.recording).map((t) => t.id);

  for (const id of await framesWanted(ids.filter((i) => !framesTried.has(i)))) {
    const frames = await source.frames(id).catch(() => null);

    if (!frames) continue;

    framesTried.add(id);

    if (frames.length) await keepFrames(id, frames);
  }
}

export function feedFrames(): Promise<void> {
  feeding ??= (async () => {
    for (const source of [...frameSources]) await feedSource(source).catch(() => {});
  })().finally(() => {
    feeding = null;
  });

  return feeding;
}

export async function searchTries(text: string): Promise<TryHit[]> {
  await syncSearch();

  const words = await client.call('words', { text, now: Date.now() });

  if (words) void feedFrames();

  const textVector = words && framed ? await embedText(words).catch(() => null) : null;

  return client.call('search', { text, now: Date.now(), limit: SEARCH_LIMIT, textVector });
}

export async function framesWanted(ids: string[]): Promise<string[]> {
  await syncSearch();

  return client.call('unframed', { ids });
}

export async function keepFrames(tryId: string, frames: FrameVector[]) {
  await syncSearch();
  await client.call(
    'putFrames',
    { tryId, frames },
    frames.map((f) => f.vector.buffer),
  );
  framed ||= frames.length > 0;
  saveSoon();
  changed();
}
