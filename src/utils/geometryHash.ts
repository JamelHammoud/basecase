import { hashText } from '../guide/guideItems';

const hashes = new WeakMap<object, string>();

function remembered(value: object, compute: () => string): string {
  const known = hashes.get(value);

  if (known !== undefined) return known;

  const hash = compute();

  hashes.set(value, hash);

  return hash;
}

function hashNumbers(values: ArrayLike<number>): string {
  let h = 0x811c9dc5;

  for (let i = 0; i < values.length; i++) {
    h ^= Math.round(values[i] * 10000);
    h = Math.imul(h, 0x01000193);
  }

  return `${values.length}:${(h >>> 0).toString(36)}`;
}

export const numbersHash = (values: (ArrayLike<number> & object) | null | undefined): string =>
  values ? remembered(values, () => hashNumbers(values)) : '';

export const jsonHash = (value: object | null | undefined): string =>
  value ? remembered(value, () => hashText(JSON.stringify(value))) : '';
