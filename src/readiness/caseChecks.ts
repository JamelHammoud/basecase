import { MISSED, type CaseRuns } from '../cases/caseRuns';
import type { CheckRow } from '../utils/engineeringTypes';
import type { Finding } from './types';

export const CASE_RULE = 'case';
export const CASES = 'Cases';
export const CASE_STOPPED = 'The runs stopped with an error.';

const PASS_SHARE = 0.9;
const WARN_SHARE = 0.5;

export function caseStatus(runs: Pick<CaseRuns, 'runs' | 'passes' | 'refusal'>): CheckRow['status'] {
  if (runs.refusal || !runs.runs) return 'fail';

  const share = runs.passes / runs.runs;

  if (share >= PASS_SHARE) return 'pass';

  return share >= WARN_SHARE ? 'warn' : 'fail';
}

const failureText = (label: string) => (label === MISSED ? 'Missed' : label.charAt(0).toUpperCase() + label.slice(1));

export function caseRow(kase: { id: string; name: string }, runs: CaseRuns): CheckRow {
  const status = caseStatus(runs);
  const base = { check: kase.name, status, caseId: kase.id };

  if (runs.refusal) return { ...base, detail: '', items: [{ text: runs.refusal, status: 'fail' }] };

  const detail = `${runs.passes} of ${runs.runs}`;
  const failure = status === 'pass' || !runs.commonFailure ? [] : [{ text: failureText(runs.commonFailure) }];

  return { ...base, detail, items: failure };
}

export const stoppedRow = (kase: { id: string; name: string }): CheckRow =>
  caseRow(kase, { runs: 0, passes: 0, medianMargin: -1, commonFailure: null, refusal: CASE_STOPPED });

function agentTextOf(row: CheckRow, failure: string): string {
  if (failure === CASE_STOPPED)
    return `Case ${row.check}: its runs stopped with an error, so it isn't judged. Run get_readiness again.`;

  if (!row.detail) return `Case ${row.check}: the robot can't enter it. ${failure}`;

  return `Case ${row.check}: passed ${row.detail} randomized runs (friction, mass, servo strength and delay varied). Most common failure: ${failure}. Change the design so it passes at least 18 of 20.`;
}

export function caseFindings(rows: CheckRow[]): Finding[] {
  return rows.flatMap((row) => {
    const item = row.items?.[0];

    if (!row.caseId || row.status === 'pass' || !item) return [];

    return [
      {
        key: `design:${CASE_RULE}:${row.caseId}`,
        level: 'note',
        area: 'design',
        check: row.check,
        rule: CASE_RULE,
        ruleName: CASES,
        text: item.text,
        agentText: agentTextOf(row, item.text),
        ids: [],
      } satisfies Finding,
    ];
  });
}
