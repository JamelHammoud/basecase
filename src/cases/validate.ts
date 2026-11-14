export class CaseFileError extends Error {}

export type Reader<T> = (value: unknown, where: string) => T;

export const refuse = (where: string, what: string): never => {
  throw new CaseFileError(`${where} ${what}`);
};

export const asRecord: Reader<Record<string, unknown>> = (value, where) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return refuse(where, 'must be an object');

  return value as Record<string, unknown>;
};

export const asString: Reader<string> = (value, where) => {
  if (typeof value !== 'string' || value.length > 2000) return refuse(where, 'must be a short string');

  return value;
};

export const asId: Reader<string> = (value, where) => {
  const id = asString(value, where);

  return /^[\w.-]{1,80}$/.test(id) ? id : refuse(where, 'must be a plain id');
};

export const asNumber: Reader<number> = (value, where) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return refuse(where, 'must be a finite number');

  return value;
};

export const asBoolean: Reader<boolean> = (value, where) =>
  typeof value === 'boolean' ? value : refuse(where, 'must be true or false');

export const oneOf =
  <T extends string>(options: readonly T[]): Reader<T> =>
  (value, where) =>
    options.includes(value as T) ? (value as T) : refuse(where, `must be one of ${options.join(', ')}`);

export const listOf =
  <T>(read: Reader<T>, max: number): Reader<T[]> =>
  (value, where) => {
    if (!Array.isArray(value)) return refuse(where, 'must be a list');

    if (value.length > max) return refuse(where, `holds more than ${max} items`);

    return value.map((item, i) => read(item, `${where}[${i}]`));
  };

export const vector =
  <N extends number>(size: N) =>
  (value: unknown, where: string): number[] => {
    const v = listOf(asNumber, size)(value, where);

    return v.length === size ? v : refuse(where, `must hold ${size} numbers`);
  };

export const optional = <T>(read: Reader<T>, value: unknown, where: string): T | undefined =>
  value === undefined ? undefined : read(value, where);
