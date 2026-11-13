import { rewriteDimensions } from '../cad-kernel/dimensions.mjs';

const PART_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,120}$/;
const MAX_VALUES = 64;
const KEYS = new Set(['id', 'workspaceId', 'values']);

export const PART_SOURCE_MS = 10000;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

const refuse = () => {
  throw new Error('Those dimensions can’t be changed.');
};

export function checkedTune(payload) {
  if (!isPlainObject(payload) || Object.keys(payload).some((key) => !KEYS.has(key))) refuse();

  const { id, workspaceId, values } = payload;
  const entries = isPlainObject(values) ? Object.entries(values) : [];
  const numbers = entries.every(([, v]) => typeof v === 'number' && Number.isFinite(v));
  const workspace = workspaceId === undefined || (typeof workspaceId === 'string' && WORKSPACE_ID.test(workspaceId));

  if (typeof id !== 'string' || !PART_ID.test(id) || !workspace) refuse();

  if (!entries.length || entries.length > MAX_VALUES || !numbers) refuse();

  return { id, workspaceId, values: Object.fromEntries(entries) };
}

export async function tuneCadPart({ kernel, source }, payload) {
  const { id, workspaceId, values } = checkedTune(payload);
  const part = await source(id, workspaceId);

  if (part?.language !== 'openscad' || typeof part.code !== 'string') refuse();

  const code = rewriteDimensions(part.code, values);
  const result = await kernel.render({ language: 'openscad', code, expect: part.expect ?? undefined });

  return { code, result };
}
