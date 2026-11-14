import type { TakeManifest } from '../../../electron/robot/robotTake.mjs';
import { useEffect, useSyncExternalStore } from 'react';
import type { Recording } from '../../sim/recorder';
import { indexedDbStore } from '../../utils/keyValueStore';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import { summaryOf, type StoredTry, type TrySummary } from '../tryFile';
import { desktopTries } from './desktopTries';
import { TRIES_LABEL, type TryBackend } from './types';
import { webTries } from './webTries';

export interface KeptTry {
  stored: StoredTry;
  recording: Recording | null;
}

const backend: TryBackend = IS_WEB_DEMO ? webTries : desktopTries;

export const legacyRecordings = indexedDbStore<Recording>({
  database: 'basecase-tries',
  store: 'recordings',
  label: TRIES_LABEL,
});

let listed: TrySummary[] | null = null;
let loading: Promise<TrySummary[]> | null = null;
const listeners = new Set<() => void>();

function publish(next: TrySummary[]) {
  listed = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

export function loadTries(): Promise<TrySummary[]> {
  if (listed) return Promise.resolve(listed);

  loading ??= backend.list().then(
    (found) => {
      publish(found);

      return found;
    },
    () => {
      loading = null;

      return [];
    },
  );

  return loading;
}

export function useTries(): TrySummary[] | null {
  const tries = useSyncExternalStore(subscribe, () => listed);

  useEffect(() => {
    void loadTries();
  }, []);

  return tries;
}

async function update(change: (tries: TrySummary[]) => TrySummary[]) {
  await loadTries();

  if (listed) publish(change(listed));
}

export async function keepTries(kept: KeptTry[]) {
  if (!kept.length) return;

  for (const { stored, recording } of kept) await backend.save(stored, recording);

  const ids = new Set(kept.map((k) => k.stored.id));
  const summaries = kept.map((k) => summaryOf(k.stored, { recording: !!k.recording, strip: false }));

  await update((tries) => [...tries.filter((t) => !ids.has(t.id)), ...summaries]);
}

export async function deleteTries(ids: string[]) {
  if (!ids.length) return;

  await backend.delete(ids);

  const gone = new Set(ids);

  await update((tries) => tries.filter((t) => !gone.has(t.id)));
}

export const loadRecording = (id: string) => backend.recording(id);

export const loadStrip = (id: string) => backend.strip(id);

export async function saveStrip(id: string, strip: Blob) {
  await backend.saveStrip(id, strip);
  await update((tries) => tries.map((t) => (t.id === id ? { ...t, strip: true } : t)));
}

export const loadTryVideo = (id: string) => backend.video(id);

export async function saveTryVideo(id: string, bytes: Uint8Array) {
  if (IS_WEB_DEMO || !bytes.byteLength) return;

  await backend.saveVideo(id, bytes);
  await update((tries) => tries.map((t) => (t.id === id ? { ...t, video: true } : t)));
}

export const loadTake = (id: string) => backend.take(id);

export async function relistTries() {
  const found = await backend.list().catch(() => null);

  if (found) publish(found);
}

export const saveTake = (manifest: TakeManifest, bytes: Uint8Array) => backend.saveTake(manifest, bytes);
