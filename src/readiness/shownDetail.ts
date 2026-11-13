import type { CheckSummary, ReadinessFinding } from './types';

export function shownDetail(check: CheckSummary, findings: ReadinessFinding[]): string {
  if (!findings.length) return check.detail;

  const repeated = check.detailInItems || findings.some((f) => f.text === check.detail || f.detail === check.detail);

  return repeated ? '' : check.detail;
}
