export const STORE_MAX_BYTES = 64 * 1024;

const MAX_DEPTH = 32;

export type StoreValue = null | boolean | number | string | unknown[] | { [key: string]: unknown };

type Data = Record<string, unknown>;

const isPlainObject = (value: object) => {
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};

type Fit = 'json' | 'other' | 'big';

interface Walk {
  chars: number;
}

const grow = (walk: Walk, chars: number): Fit => {
  walk.chars += chars;

  return walk.chars > STORE_MAX_BYTES ? 'big' : 'json';
};

function fitOf(value: unknown, depth: number, walk: Walk): Fit {
  if (depth > MAX_DEPTH) return 'other';

  if (value === null || typeof value === 'boolean') return grow(walk, 4);

  if (typeof value === 'string') return grow(walk, value.length + 2);

  if (typeof value === 'number') return Number.isFinite(value) ? grow(walk, 1) : 'other';

  if (Array.isArray(value)) return listFit(value, depth, walk);

  return typeof value === 'object' && isPlainObject(value) ? fieldsFit(value, depth, walk) : 'other';
}

function listFit(items: readonly unknown[], depth: number, walk: Walk): Fit {
  if (grow(walk, items.length + 1) === 'big') return 'big';

  for (const item of items) {
    const fit = fitOf(item, depth + 1, walk);

    if (fit !== 'json') return fit;
  }

  return 'json';
}

function fieldsFit(value: object, depth: number, walk: Walk): Fit {
  const keys = Object.keys(value);

  if (grow(walk, keys.length + 1) === 'big') return 'big';

  for (const key of keys) {
    const fit = grow(walk, key.length + 3) === 'big' ? 'big' : fitOf((value as Data)[key], depth + 1, walk);

    if (fit !== 'json') return fit;
  }

  return 'json';
}

export const storeBytes = (value: StoreValue) => new TextEncoder().encode(JSON.stringify(value)).length;

const TOO_BIG = 'is over the 64 KB a Case keeps';

export function storeRefusal(value: unknown): string | null {
  const fit = fitOf(value, 0, { chars: 0 });

  if (fit === 'other') return 'isn’t plain JSON';

  return fit === 'big' || storeBytes(value as StoreValue) > STORE_MAX_BYTES ? TOO_BIG : null;
}

interface StoredCase {
  id?: unknown;
  store?: unknown;
}

export function withCaseStore<T>(cases: readonly T[] | undefined, id: string, value: StoreValue): T[] {
  return (cases ?? []).map((raw) => {
    const kase = raw as StoredCase;

    if (kase?.id !== id) return raw;

    const rest: Record<string, unknown> = { ...kase };

    delete rest.store;

    return (value === null ? rest : { ...rest, store: value }) as T;
  });
}
