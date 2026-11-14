import { useEffect, useSyncExternalStore } from 'react';
import type { Recording } from '../../sim/recorder';
import { indexedDbStore } from '../../utils/keyValueStore';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import { summaryOf, type StoredTry, type TrySummary } from '../tryFile';
import { desktopTries } from './desktopTries';
import { TRIES_LABEL, type Relabel, type TryBackend } from './types';
import type { LabelPatch } from '../tryLabels';
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

export const loadStoredTry = (id: string) => backend.manifest(id);

function relabelled(summary: TrySummary, patch: LabelPatch): TrySummary {
  return {
    ...summary,
    ...(patch.tags !== undefined ? { tags: patch.tags ?? [] } : {}),
    ...(patch.mark !== undefined ? { mark: patch.mark ?? null } : {}),
    ...(patch.judged !== undefined ? { judged: patch.judged?.verdict ?? null } : {}),
  };
}

const relabelListeners = new Set<(changes: Relabel[]) => void>();

export function onRelabel(listener: (changes: Relabel[]) => void) {
  relabelListeners.add(listener);

  return () => {
    relabelListeners.delete(listener);
  };
}

export async function relabelTries(changes: Relabel[]) {
  if (!changes.length) return;

  await backend.relabel(changes);
  relabelListeners.forEach((listener) => listener(changes));

  const byId = new Map(changes.map((c) => [c.id, c.patch]));

  await update((tries) => tries.map((t) => (byId.has(t.id) ? relabelled(t, byId.get(t.id)!) : t)));
}

export type { Relabel };

export const loadStrip = (id: string) => backend.strip(id);

export async function saveStrip(id: string, strip: Blob) {
  await backend.saveStrip(id, strip);
  await update((tries) => tries.map((t) => (t.id === id ? { ...t, strip: true } : t)));
}
