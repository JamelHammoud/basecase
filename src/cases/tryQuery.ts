import { TRY_SOURCE_BADGE, type TrySummary } from './tryFile';

export const textMatcher = (query: string) => {
  const q = query.trim().toLowerCase();

  return (...fields: Array<string | null | undefined>) => !q || fields.some((f) => f?.toLowerCase().includes(q));
};

export const tryMatches = (query: string) => {
  const matches = textMatcher(query);

  return (t: TrySummary) => matches(t.caseName, t.robot, TRY_SOURCE_BADGE[t.source]);
};
