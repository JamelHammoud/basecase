export const DEFAULT_UNIT = 'robot';

export const MAX_UNITS = 32;

const UNIT_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const isUnitName = (name) => typeof name === 'string' && UNIT_NAME.test(name);

export function unitOf(ask) {
  if (ask === undefined || ask === null) return DEFAULT_UNIT;

  return isUnitName(ask) ? ask : null;
}

export function nextUnitName(taken) {
  const names = new Set(taken);

  if (!names.has(DEFAULT_UNIT)) return DEFAULT_UNIT;

  let n = 2;

  while (names.has(`${DEFAULT_UNIT}-${n}`)) n += 1;

  return `${DEFAULT_UNIT}-${n}`;
}

export const versionOf = (ref) => {
  if (!ref) return null;

  return ref.kind === 'skill' ? ref.hash : ref.id;
};
