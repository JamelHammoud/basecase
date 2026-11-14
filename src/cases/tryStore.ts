import type { Recording } from '../sim/recorder';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { trySummary, type TryRecord } from './tries';
import { diskTries } from './tryStoreDisk';
import { webTries } from './tryStoreWeb';

export interface OpenedTry {
  record: TryRecord;
  recording: Recording | null;
}

export interface TryBackend {
  list: () => Promise<TryRecord[]>;
  save: (record: TryRecord, recording: Recording | null) => Promise<void>;
  open: (id: string) => Promise<OpenedTry | null>;
  remove: (ids: string[]) => Promise<string[]>;
  film: (id: string) => Promise<Blob | null>;
  saveFilm: (id: string, film: Blob) => Promise<void>;
}

export interface SavedTry {
  record: TryRecord;
  recording: Recording | null;
}

const backend: TryBackend = IS_WEB_DEMO ? webTries : diskTries;

const EMPTY: TryRecord[] = [];

let listed: TryRecord[] | null = null;
let loading: Promise<TryRecord[]> | null = null;
const listeners = new Set<() => void>();
const deletions = new Set<(gone: Set<string>) => void>();

function publish(next: TryRecord[]) {
  listed = next;
  listeners.forEach((listener) => listener());
}

export function loadTries(): Promise<TryRecord[]> {
  loading ??= backend.list().then(
    (all) => {
      publish(all);

      return all;
    },
    () => {
      loading = null;

      return listed ?? EMPTY;
    },
  );

  return loading;
}

export const storedTries = () => listed ?? EMPTY;

export function subscribeTries(listener: () => void) {
  listeners.add(listener);
  void loadTries();

  return () => {
    listeners.delete(listener);
  };
}

export async function saveTries(saved: SavedTry[]) {
  for (const { record, recording } of saved) await backend.save(record, recording);

  await loadTries();

  const ids = new Set(saved.map((s) => s.record.id));

  publish([...saved.map((s) => trySummary(s.record)), ...storedTries().filter((t) => !ids.has(t.id))]);
}

export const saveTry = (record: TryRecord, recording: Recording | null) => saveTries([{ record, recording }]);

export const openTry = (id: string) => backend.open(id);

export const loadRecording = async (id: string) => (await backend.open(id))?.recording ?? null;

export async function updateTry(id: string, change: (record: TryRecord) => TryRecord) {
  const opened = await backend.open(id);

  if (opened) await saveTry(change(opened.record), null);
}

export function onTriesDeleted(listener: (gone: Set<string>) => void) {
  deletions.add(listener);

  return () => {
    deletions.delete(listener);
  };
}

export async function deleteTries(ids: string[]) {
  const asked = new Set(ids);

  if (asked.size) deletions.forEach((listener) => listener(asked));

  const deleted = ids.length ? await backend.remove(ids) : [];
  const gone = new Set(deleted);

  publish(storedTries().filter((t) => !gone.has(t.id)));

  return deleted;
}

export const tryFilm = (id: string) => backend.film(id);

export const saveTryFilm = (id: string, film: Blob) => backend.saveFilm(id, film);
