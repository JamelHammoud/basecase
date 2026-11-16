export const recordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const finiteValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const boundedInteger = (value: unknown, max: number) =>
  finiteValue(value) && Number.isInteger(value) && value >= 0 && value <= max;
export const stringValue = (value: unknown): value is string => typeof value === 'string' && value.length <= 10000;
export const optionalString = (value: unknown) => value === undefined || stringValue(value);
export const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.length <= 10000 && value.every(stringValue);
export const vectorValue = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every(finiteValue);

export function finiteTree(value: unknown, depth = 0, ancestors = new Set<unknown>()): boolean {
  if (depth > 64) return false;

  if (typeof value === 'number') return Number.isFinite(value);

  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return true;

  if (typeof value !== 'object' || ancestors.has(value)) return false;

  ancestors.add(value);

  const valid = Object.values(value).every((child) => finiteTree(child, depth + 1, ancestors));

  ancestors.delete(value);

  return valid;
}
