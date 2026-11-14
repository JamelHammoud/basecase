import type { TrySummary } from '../cases/tryFile';
import { tryMatches } from '../cases/tryQuery';
import type { Dataset } from './datasetFile';

export interface DatasetStats {
  episodes: number;
  seconds: number;
}

export const datasetStats = (members: TrySummary[]): DatasetStats => ({
  episodes: members.length,
  seconds: members.reduce((sum, t) => sum + t.seconds, 0),
});

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
