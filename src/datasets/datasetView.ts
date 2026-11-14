import type { TrySource, TrySummary, TryVerdict } from '../cases/tryFile';
import { tryMatches } from '../cases/tryQuery';
import type { Dataset } from './datasetFile';

export interface DatasetStats {
  episodes: number;
  seconds: number;
  sources: Partial<Record<TrySource, number>>;
  robots: Record<string, number>;
  outcomes: Partial<Record<TryVerdict, number>>;
}

const bump = <K extends string>(counts: Partial<Record<K, number>>, key: K) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

export function datasetStats(members: TrySummary[]): DatasetStats {
  const stats: DatasetStats = { episodes: members.length, seconds: 0, sources: {}, robots: {}, outcomes: {} };

  for (const t of members) {
    stats.seconds += t.seconds;
    bump(stats.sources, t.source);
    bump(stats.robots, t.robot);
    bump(stats.outcomes, t.outcome.verdict);
  }

  return stats;
}

export function membersOf(dataset: Dataset, tries: TrySummary[]): TrySummary[] {
  const byId = new Map(tries.map((t) => [t.id, t]));

  return dataset.members.flatMap((id) => byId.get(id) ?? []);
}

export interface MemberGroups {
  fitting: TrySummary[];
  apart: TrySummary[];
}

export function memberGroups(members: TrySummary[], modelHash: string | null): MemberGroups {
  if (!modelHash) return { fitting: members, apart: [] };

  return {
    fitting: members.filter((t) => t.modelHash === modelHash),
    apart: members.filter((t) => t.modelHash !== modelHash),
  };
}

export const queryMembers = (query: string, tries: TrySummary[]) => tries.filter(tryMatches(query)).map((t) => t.id);

export const usableVerdict = (t: Pick<TrySummary, 'outcome'>) => t.outcome.verdict !== 'failed';
