import type { TrainingEvaluation } from './types';

type Reports = { candidate: TrainingEvaluation; incumbent: TrainingEvaluation };

export const inspectionContextKey = ({ candidate, incumbent }: Reports) =>
  `${candidate.evidence?.hash ?? candidate.modelHash}:${incumbent.evidence?.hash ?? incumbent.modelHash}`;

export function inspectionContext() {
  let revision = 0;
  let pendingKey = '';
  let saved: { key: string; reports: Reports } | null = null;

  return {
    begin: (reports: Reports) => {
      revision++;
      pendingKey = inspectionContextKey(reports);
      saved = null;

      return revision;
    },
    remember: (token: number, reports: Reports) => {
      if (token === revision) saved = { key: inspectionContextKey(reports), reports };
    },
    read: (key: string) => {
      if (!saved || saved.key !== key) throw new Error('Condition comparison is unavailable for this saved evidence.');

      return saved.reports;
    },
    release: (key: string) => {
      if (pendingKey !== key) return;

      revision++;
      saved = null;
      pendingKey = '';
    },
  };
}
