import { indexedDbStore, type KeyValueStore } from '../../utils/keyValueStore';

export const STORE_MAX_BYTES = 64 * 1024;
export const STORE_CALLS_PER_SECOND = 10;

export interface CaseStores {
  get: (key: string) => Promise<string | null>;
  set: (key: string, json: string | null) => void;
  delete: (key: string) => void;
  deleteScene: (sceneId: string) => void;
  saved: () => Promise<void>;
}

export const caseStoreKey = (sceneId: string, caseId: string) => `${sceneId}/${caseId}`;

export interface CaseStore {
  get: () => Promise<string | null>;
  set: (json: string | null) => void;
}

export function caseStores(backend: KeyValueStore<string>): CaseStores {
  const values = new Map<string, Promise<string | null>>();
  const queued = new Map<string, string | null>();
  const writing = new Map<string, Promise<void>>();

  const write = (key: string, json: string | null) =>
    (json === null ? backend.delete(key) : backend.put(key, json)).then(
      () => undefined,
      () => undefined,
    );

  const save = (key: string) => {
    if (writing.has(key) || !queued.has(key)) return;

    const json = queued.get(key) ?? null;

    queued.delete(key);
    writing.set(
      key,
      write(key, json).then(() => {
        writing.delete(key);
        save(key);
      }),
    );
  };

  const set = (key: string, json: string | null) => {
    values.set(key, Promise.resolve(json));
    queued.set(key, json);
    save(key);
  };

  const clearing = new Set<Promise<void>>();

  const deleteScene = (sceneId: string) => {
    const prefix = caseStoreKey(sceneId, '');
    const cleared = backend.deletePrefix(prefix).then(
      () => undefined,
      () => undefined,
    );

    [...values.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => set(key, null));
    clearing.add(cleared);
    void cleared.then(() => clearing.delete(cleared));
  };

  const saved = async (): Promise<void> => {
    while (writing.size || clearing.size) await Promise.all([...writing.values(), ...clearing]);
  };

  return {
    get(key) {
      if (!values.has(key))
        values.set(
          key,
          backend.get(key).then(
            (json) => (typeof json === 'string' ? json : null),
            () => null,
          ),
        );

      return values.get(key) as Promise<string | null>;
    },
    set,
    delete: (key) => set(key, null),
    deleteScene,
    saved,
  };
}

export const CASE_STORES = caseStores(
  indexedDbStore<string>({ database: 'basecase-case-stores', store: 'values', label: 'Case values' }),
);

export const storeOf = (stores: CaseStores, key: string): CaseStore => ({
  get: () => stores.get(key),
  set: (json) => stores.set(key, json),
});

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

const isJson = (text: string) => {
  try {
    JSON.parse(text);

    return true;
  } catch {
    return false;
  }
};

export function storeRefusal(json: string | null): string | null {
  if (json === null) return null;

  if (json.length > STORE_MAX_BYTES || utf8Bytes(json) > STORE_MAX_BYTES)
    return `the store takes at most ${STORE_MAX_BYTES / 1024} KB`;

  return isJson(json) ? null : 'the store takes JSON';
}
