import { isMetric, THREAD } from '../data/hardware';
import type { Interference } from '../three/interference';
import type { ScenePart } from '../types/robotics';
import type { ChainResult } from './assemblyTypes';

export type ChainMembers = Map<string, Set<string>>;

const add = (map: ChainMembers, id: string, ids: Array<string | null | undefined>) => {
  const set = map.get(id) ?? new Set<string>();

  for (const x of ids) if (x) set.add(x);

  map.set(id, set);
};

export function chainMembers(chains: ChainResult): ChainMembers {
  const map: ChainMembers = new Map();
  const screwById = new Map(chains.screws.map((c) => [c.id, c]));

  for (const c of chains.screws) add(map, c.id, [...c.stack, c.endsIn.id]);

  for (const s of chains.sleeves) {
    const screw = s.screw ? screwById.get(s.screw) : undefined;

    add(map, s.id, [s.host, s.screw, ...(screw?.stack ?? [])]);

    if (s.screw) add(map, s.screw, [s.id, s.host]);
  }

  return map;
}

function allowanceMm(p: ScenePart | undefined): number {
  const size = p?.hardware?.size;

  return size && isMetric(size) ? THREAD[size].d * 0.45 + 0.3 : 0.6;
}

export function isOwnStack(i: Interference, members: ChainMembers, byId: Map<string, ScenePart>): boolean {
  const viaA = members.get(i.a)?.has(i.b);
  const viaB = members.get(i.b)?.has(i.a);

  if (!viaA && !viaB) return false;

  const fastener = viaA ? byId.get(i.a) : byId.get(i.b);

  return i.depthMm <= allowanceMm(fastener);
}
