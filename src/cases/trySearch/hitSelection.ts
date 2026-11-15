import type { TryHit } from './types';

export const hitKey = (hit: Pick<TryHit, 'tryId' | 'from' | 'to'>) =>
  JSON.stringify([hit.tryId, hit.from ?? null, hit.to ?? null]);

export function distinctTries(hits: TryHit[]): TryHit[] {
  const seen = new Set<string>();

  return hits.filter((hit) => {
    if (seen.has(hit.tryId)) return false;

    seen.add(hit.tryId);

    return true;
  });
}

export const hitRange = (hit: { from?: number; to?: number }) =>
  hit.from === undefined ? {} : { from: hit.from, to: hit.to };

export function hitsByTry(hits: TryHit[]) {
  const byId = new Map<string, TryHit[]>();

  for (const hit of hits) {
    const held = byId.get(hit.tryId);

    if (held) held.push(hit);
    else byId.set(hit.tryId, [hit]);
  }

  return byId;
}
