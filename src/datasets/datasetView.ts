import { summaryRecord, type TrySummary } from '../cases/tryFile';
import type { TryRecord } from '../cases/tries';
import type { Dataset } from './datasetFile';

export const totalSeconds = (members: TrySummary[]) => members.reduce((sum, t) => sum + t.seconds, 0);
export const imageCount = (dataset: Pick<Dataset, 'imageMembers'>) =>
  (dataset.imageMembers ?? []).reduce((count, member) => count + member.frameIds.length, 0);
export const classCount = (dataset: Pick<Dataset, 'imageMembers'>) =>
  dataset.imageMembers?.some((member) => member.classes === undefined)
    ? null
    : new Set((dataset.imageMembers ?? []).flatMap((member) => member.classes ?? [])).size;

export function membersOf(dataset: Dataset, tries: TrySummary[]): TrySummary[] {
  const byId = new Map(tries.map((t) => [t.id, t]));

  return dataset.members.flatMap((id) => byId.get(id) ?? []);
}

export interface MemberGroups {
  fitting: TrySummary[];
  earlier: TrySummary[];
  elsewhere: TrySummary[];
}

export interface OpenModel {
  modelHash: string | null;
  sceneId: string | null;
  caseId: string | null;
}

export function memberGroups(members: TrySummary[], here: OpenModel): MemberGroups {
  if (!here.modelHash) return { fitting: members, earlier: [], elsewhere: [] };

  const apart = members.filter((t) => t.modelHash !== here.modelHash);
  const sameCase = (t: TrySummary) => t.sceneId === here.sceneId && t.caseId === here.caseId;

  return {
    fitting: members.filter((t) => t.modelHash === here.modelHash),
    earlier: apart.filter(sameCase),
    elsewhere: apart.filter((t) => !sameCase(t)),
  };
}

export const memberRecord = (summary: TrySummary): TryRecord => ({
  ...summaryRecord(summary),
  passed: summary.outcome.verdict !== 'failed',
});
