import { seedOf } from './datasetFile';

const HOLD_OUT_EVERY = 5;

export const heldOut = (index: number, count: number) =>
  count < HOLD_OUT_EVERY ? index + 1 === count : index % HOLD_OUT_EVERY === HOLD_OUT_EVERY - 1;

export interface DatasetSplit {
  order: string[];
  train: string[];
  validation: string[];
}

export function splitOf(ids: string[], seed: number): DatasetSplit {
  const keyed = ids.map((id) => ({ id, key: seedOf(`${seed}:${id}`) }));
  const order = keyed.sort((a, b) => a.key - b.key || a.id.localeCompare(b.id)).map((k) => k.id);
  const validation = order.filter((_, i) => order.length > 1 && heldOut(i, order.length));
  const held = new Set(validation);

  return { order, train: order.filter((id) => !held.has(id)), validation };
}
