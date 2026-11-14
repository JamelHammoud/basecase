import { indexedDbStore, type KeyValueStore } from '../../utils/keyValueStore';

export const STORE_MAX_BYTES = 64 * 1024;
export const STORE_CALLS_PER_SECOND = 10;

export interface CaseStores {
  get: (caseId: string) => Promise<string | null>;
  set: (caseId: string, json: string | null) => void;
  delete: (caseId: string) => void;
  saved: () => Promise<void>;
}

export interface CaseStore {
  get: () => Promise<string | null>;
  set: (json: string | null) => void;
}

export function caseStores(backend: KeyValueStore<string>): CaseStores {
  const values = new Map<string, Promise<string | null>>();
  const queued = new Map<string, string | null>();
  const writing = new Map<string, Promise<void>>();

  const write = (caseId: string, json: string | null) =>
    (json === null ? backend.delete(caseId) : backend.put(caseId, json)).then(
      () => undefined,
      () => undefined,
    );

  const save = (caseId: string) => {
    if (writing.has(caseId) || !queued.has(caseId)) return;

    const json = queued.get(caseId) ?? null;

    queued.delete(caseId);
    writing.set(
      caseId,
      write(caseId, json).then(() => {
        writing.delete(caseId);
        save(caseId);
      }),
    );
  };

  const set = (caseId: string, json: string | null) => {
    values.set(caseId, Promise.resolve(json));
    queued.set(caseId, json);
    save(caseId);
  };

  const saved = async (): Promise<void> => {
    while (writing.size) await Promise.all(writing.values());
  };

  return {
    get(caseId) {
      if (!values.has(caseId))
        values.set(
          caseId,
          backend.get(caseId).then(
            (json) => (typeof json === 'string' ? json : null),
            () => null,
          ),
        );

      return values.get(caseId) as Promise<string | null>;
    },
    set,
    delete: (caseId) => set(caseId, null),
    saved,
  };
}

export const CASE_STORES = caseStores(indexedDbStore<string>('basecase-case-stores', 'values'));

export const storeOf = (stores: CaseStores, caseId: string): CaseStore => ({
  get: () => stores.get(caseId),
  set: (json) => stores.set(caseId, json),
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
