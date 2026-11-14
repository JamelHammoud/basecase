import { refuse, type Reader } from './validate';

export type CaseStore = Record<string, unknown>;

export const CASE_STORE_MAX_BYTES = 64 * 1024;

const MAX_DEPTH = 16;
const MAX_KEY = 80;

const isPlain = (value: object) => {
  const proto: unknown = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};

function jsonProblem(value: unknown, depth: number): string | null {
  if (depth > MAX_DEPTH) return `nests deeper than ${MAX_DEPTH}`;

  if (value === null || typeof value === 'boolean' || typeof value === 'string') return null;

  if (typeof value === 'number') return Number.isFinite(value) ? null : 'holds a number that isn’t finite';

  if (Array.isArray(value)) return value.map((v) => jsonProblem(v, depth + 1)).find(Boolean) ?? null;

  if (typeof value !== 'object' || !isPlain(value)) return 'holds something that isn’t JSON';

  return (
    Object.values(value)
      .map((v) => jsonProblem(v, depth + 1))
      .find(Boolean) ?? null
  );
}

export const storeBytes = (store: CaseStore) => new TextEncoder().encode(JSON.stringify(store)).length;

export function storeProblem(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'must be an object';

  const problem = jsonProblem(value, 0);

  if (problem) return problem;

  if (Object.keys(value).some((key) => !key || key.length > MAX_KEY)) return `has a key longer than ${MAX_KEY}`;

  const bytes = storeBytes(value as CaseStore);

  return bytes > CASE_STORE_MAX_BYTES
    ? `holds ${Math.ceil(bytes / 1024)} KB, over ${CASE_STORE_MAX_BYTES / 1024} KB`
    : null;
}

export const readStore: Reader<CaseStore> = (value, where) => {
  const problem = storeProblem(value);

  return problem ? refuse(where, problem) : (structuredClone(value) as CaseStore);
};

export function storeWith(store: CaseStore | undefined, key: string, value: unknown): CaseStore | string {
  const next: CaseStore = { ...store };

  if (value === null || value === undefined) delete next[key];
  else next[key] = value;

  return storeProblem(next) ?? next;
}
