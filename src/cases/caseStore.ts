export const STORE_MAX_BYTES = 64 * 1024;

const MAX_DEPTH = 32;

export type StoreValue = null | boolean | number | string | unknown[] | { [key: string]: unknown };

const isPlainObject = (value: object) => {
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};

function isJson(value: unknown, depth = 0): value is StoreValue {
  if (depth > MAX_DEPTH) return false;

  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;

  if (typeof value === 'number') return Number.isFinite(value);

  if (Array.isArray(value)) return value.every((v) => isJson(v, depth + 1));

  return typeof value === 'object' && isPlainObject(value) && Object.values(value).every((v) => isJson(v, depth + 1));
}

export const storeBytes = (value: StoreValue) => new TextEncoder().encode(JSON.stringify(value)).length;

export function storeRefusal(value: unknown): string | null {
  if (!isJson(value)) return 'isn’t plain JSON';

  const bytes = storeBytes(value);

  return bytes > STORE_MAX_BYTES ? `is ${Math.ceil(bytes / 1024)} KB, over the 64 KB a Case keeps` : null;
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
