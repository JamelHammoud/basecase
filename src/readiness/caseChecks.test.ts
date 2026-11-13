import { describe, expect, it } from 'vitest';
import type { CaseRuns } from '../cases/caseRuns';
import type { ScenePart } from '../types/robotics';
import { caseFindings, caseRow, caseStatus } from './caseChecks';
import { ignoreFinding, ignoreRule, readinessOf, withDecisions } from './readiness';

const runs = (passes: number, extra: Partial<CaseRuns> = {}): CaseRuns => ({
  runs: 20,
  passes,
  medianMargin: 0,
  commonFailure: passes < 20 ? 'fell' : null,
  refusal: null,
  ...extra,
});

const kase = { id: 'walk', name: 'Walk Without Falling' };

const part: ScenePart = {
  id: 'body',
  name: 'Body',
  kind: 'cube',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
};

function readinessWith(row: ReturnType<typeof caseRow>) {
  return readinessOf(caseFindings([row]), { parts: [part], fingerprint: 'f', rows: [row] });
}

describe('the Cases check', () => {
  it('passes at 18 of 20, warns from 10 to 17 and fails below 10', () => {
    expect([20, 18, 17, 10, 9, 0].map((n) => caseStatus(runs(n)))).toEqual([
      'pass',
      'pass',
      'warn',
      'warn',
      'fail',
      'fail',
    ]);
  });

  it('titles the row with the Case, counts the runs and names the most common failure', () => {
    expect(caseRow(kase, runs(17))).toEqual({
      check: 'Walk Without Falling',
      caseId: 'walk',
      status: 'warn',
      detail: '17 of 20',
      items: [{ text: 'Fell' }],
    });
    expect(caseRow(kase, runs(4, { commonFailure: 'missed' })).items).toEqual([{ text: 'Missed' }]);
    expect(caseRow(kase, runs(20)).items).toEqual([]);
  });

  it('is a note, never a blocker, and keeps a failing row red', () => {
    const r = readinessWith(caseRow(kase, runs(3)));

    expect(r.status).toBe('ready');
    expect(r.blockers).toEqual([]);
    expect(r.notes.map((f) => f.text)).toEqual(['Fell']);
    expect(r.checks.find((c) => c.caseId === 'walk')).toMatchObject({ status: 'fail', detail: '3 of 20' });
  });

  it('can be ignored like any other row, one Case or all of them', () => {
    const r = readinessWith(caseRow(kase, runs(3)));
    const [finding] = r.notes;
    const one = withDecisions(r, [part], ignoreFinding(undefined, finding));
    const all = withDecisions(r, [part], ignoreRule(undefined, finding));

    expect(finding.ruleName).toBe('Cases');
    expect(one.checks.find((c) => c.caseId === 'walk')?.status).toBe('pass');
    expect(all.ignoredRules).toEqual([{ rule: 'case', name: 'Cases', count: 1 }]);
  });
});
