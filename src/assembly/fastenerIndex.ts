import type { FastenerChain } from './assemblyTypes';

export interface FastenerIndex {
  byId: Map<string, FastenerChain>;
  byPart: Map<string, FastenerChain[]>;
  order: Map<FastenerChain, number>;
}

export function indexFasteners(screws: FastenerChain[]): FastenerIndex {
  const byId = new Map<string, FastenerChain>();
  const byPart = new Map<string, FastenerChain[]>();
  const order = new Map<FastenerChain, number>();

  for (const chain of screws) {
    if (!byId.has(chain.id)) byId.set(chain.id, chain);

    order.set(chain, order.size);

    for (const id of new Set(chain.stack)) {
      const pins = byPart.get(id);

      if (pins) pins.push(chain);
      else byPart.set(id, [chain]);
    }
  }

  return { byId, byPart, order };
}

export function clampingScrews(index: FastenerIndex, parts: string[]): FastenerChain[] {
  const found = new Set(parts.flatMap((id) => index.byPart.get(id) ?? []));

  return [...found].sort((a, b) => index.order.get(a)! - index.order.get(b)!);
}
