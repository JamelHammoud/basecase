import { useEffect, useSyncExternalStore } from 'react';
import type { Recording } from '../../sim/recorder';
import { indexedDbStore } from '../../utils/keyValueStore';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import { summaryOf, type StoredTry, type TrySummary } from '../tryFile';
import { motionTrace } from '../trySearch/motion';
import { desktopTries } from './desktopTries';
import { TRIES_LABEL, type TryBackend } from './types';
import { webTries } from './webTries';

export interface KeptTry {
  stored: StoredTry;
  recording: Recording | null;
}

export interface TriesChange {
  kept: StoredTry[];
  deleted: string[];
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
const changeListeners = new Set<(change: TriesChange) => void>();

export function onTriesChanged(listener: (change: TriesChange) => void): () => void {
  changeListeners.add(listener);

  return () => changeListeners.delete(listener);
}

const changed = (change: TriesChange) => changeListeners.forEach((listener) => listener(change));

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

const withMotion = ({ stored, recording }: KeptTry): KeptTry => {
  const motion = stored.motion ?? (recording && motionTrace(recording));

  return { stored: motion ? { ...stored, motion } : stored, recording };
};

export async function keepTries(given: KeptTry[]) {
  if (!given.length) return;

  const kept = given.map(withMotion);

  for (const { stored, recording } of kept) await backend.save(stored, recording);

  const ids = new Set(kept.map((k) => k.stored.id));
  const summaries = kept.map((k) => summaryOf(k.stored, { recording: !!k.recording, strip: false }));

  await update((tries) => [...tries.filter((t) => !ids.has(t.id)), ...summaries]);
  changed({ kept: kept.map((k) => k.stored), deleted: [] });
}

export async function saveManifest(stored: StoredTry) {
  await backend.save(stored, null);
  changed({ kept: [stored], deleted: [] });
}

export const loadManifests = (ids: string[]) => backend.manifests(ids);

export const loadSearchIndex = () => backend.index();

export const saveSearchIndex = (bytes: Uint8Array) => backend.saveIndex(bytes);

export async function deleteTries(ids: string[]) {
  if (!ids.length) return;

  await backend.delete(ids);

  const gone = new Set(ids);

  await update((tries) => tries.filter((t) => !gone.has(t.id)));
  changed({ kept: [], deleted: ids });
}

export const loadRecording = (id: string) => backend.recording(id);

export const loadStrip = (id: string) => backend.strip(id);

export async function saveStrip(id: string, strip: Blob) {
  await backend.saveStrip(id, strip);
  await update((tries) => tries.map((t) => (t.id === id ? { ...t, strip: true } : t)));
}
