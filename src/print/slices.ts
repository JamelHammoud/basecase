import type { SliceRecord } from './printBridge';

type PlateKey = { hash: string | null; number: number };

export function sliceLookup<T extends PlateKey>(slices: readonly T[] = [], accepts?: (slice: T) => boolean) {
  const byHash = new Map<string | null, Map<number, T>>();

  for (const slice of slices) {
    const { hash, number } = slice;

    if (Number.isNaN(number) || (accepts && !accepts(slice))) continue;

    const byNumber = byHash.get(hash) ?? new Map<number, T>();

    if (!byNumber.has(number)) byNumber.set(number, slice);

    byHash.set(hash, byNumber);
  }

  return (plate: PlateKey) => byHash.get(plate.hash)?.get(plate.number);
}

export const currentSlices = (slice: Pick<SliceRecord, 'labels' | 'plates'> | null, labels: string) =>
  (slice?.labels ?? '') === labels ? slice?.plates : undefined;
