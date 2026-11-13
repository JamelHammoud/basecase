import type { ChainResult, FastenerChain } from '../../assembly/assemblyTypes';
import type { MergeCandidate } from './mergeTypes';

export type Pair = [string, string];

const byId = (a: string, b: string) => Number(a > b) - Number(a < b);

function hostsOf(chains: ChainResult): Map<string, string> {
  return new Map(chains.sleeves.filter((s) => s.host).map((s) => [s.id, s.host!]));
}

export function clampedBy(chain: FastenerChain, hosts: Map<string, string>): string[] {
  const { kind, id } = chain.endsIn;
  const end = (kind === 'printed' || kind === 'component') && id ? [id] : [];
  const host = kind === 'insert' && id && hosts.get(id) ? [hosts.get(id)!] : [];

  return [...new Set([...chain.stack, ...end, ...host])].sort(byId);
}

const joinsOnly = (chain: FastenerChain) =>
  chain.endsIn.kind !== 'standoff' && chain.endsIn.kind !== 'none' && !chain.problems.some((p) => p.code === 'air');

export function joinedPairs(chains: ChainResult, candidates: MergeCandidate[]): Pair[] {
  const known = new Map(candidates.map((c) => [c.id, c]));
  const hosts = hostsOf(chains);
  const pairs = new Map<string, Pair>();

  for (const chain of chains.screws.filter(joinsOnly)) {
    const clamped = clampedBy(chain, hosts);
    const first = known.get(clamped[0]);
    const alike = clamped.every((id) => {
      const c = known.get(id);

      return !!c && !!first && c.link === first.link && c.material === first.material;
    });

    if (clamped.length < 2 || !alike) continue;

    for (let i = 0; i < clamped.length; i++)
      for (let j = i + 1; j < clamped.length; j++) pairs.set(`${clamped[i]}|${clamped[j]}`, [clamped[i], clamped[j]]);
  }

  return [...pairs.values()].sort((a, b) => byId(a[0], b[0]) || byId(a[1], b[1]));
}

export function connectedGroups(ids: string[], pairs: Pair[]): string[][] {
  const root = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => (root.get(id) === id ? id : find(root.get(id)!));

  for (const [a, b] of pairs) {
    const [ra, rb] = [find(a), find(b)].sort(byId);

    root.set(rb, ra);
  }

  const groups = new Map<string, string[]>();

  for (const id of [...ids].sort(byId)) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);

  return [...groups.values()].filter((g) => g.length > 1);
}

export function isConnected(members: string[], pairs: Pair[]): boolean {
  const inside = new Set(members);

  return connectedGroups(
    members,
    pairs.filter(([a, b]) => inside.has(a) && inside.has(b)),
  ).some((g) => g.length === members.length);
}

export function joiningHardware(chains: ChainResult, members: Set<string>): { screws: string[]; hardware: string[] } {
  const hosts = hostsOf(chains);
  const screws = chains.screws
    .filter((c) => {
      const clamped = clampedBy(c, hosts);

      return clamped.length > 1 && clamped.every((id) => members.has(id));
    })
    .map((c) => c.id)
    .sort(byId);
  const dropped = new Set(screws);
  const sleeves = chains.sleeves.filter((s) => s.screw && dropped.has(s.screw)).map((s) => s.id);

  return { screws, hardware: [...screws, ...sleeves].sort(byId) };
}
