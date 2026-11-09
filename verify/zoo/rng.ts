import { createHash, randomBytes } from 'node:crypto';

export type Rng = () => number;

export function seededRng(...parts: string[]): Rng {
  let block = createHash('sha256').update(parts.join('\u0000')).digest();
  let offset = 0;
  let counter = 0;

  return () => {
    if (offset + 6 > block.length) {
      counter += 1;
      block = createHash('sha256').update(block).update(String(counter)).digest();
      offset = 0;
    }

    const value = block.readUIntBE(offset, 6) / 2 ** 48;

    offset += 6;

    return value;
  };
}

export const freshSeed = () => randomBytes(32).toString('hex');

export const between = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();

export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length];

export const round = (value: number, step: number) => Math.round(value / step) * step;

export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];

  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));

    [out[i], out[j]] = [out[j], out[i]];
  }

  return out;
}
