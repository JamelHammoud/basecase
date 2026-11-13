import { describe, expect, it } from 'vitest';
import { failedTests, flakeStep, passedOnRerun } from './flakes.mjs';

const esc = String.fromCharCode(27);

describe('flaky tests', () => {
  it('reads each failed test from a Check log once, without its colours, escaped or not', () => {
    const log = [
      `e2e (2)\tRun\t2026-11-13T14:57:05Z ${esc}[41m${esc}[1m FAIL ${esc}[22m${esc}[49m e2e/drive.e2e.test.ts${esc}[2m > ${esc}[22mCases${esc}[2m > ${esc}[22mpublishes a passed try`,
      'e2e (2)\tRun\t2026-11-13T14:57:06Z  FAIL  e2e/drive.e2e.test.ts > Cases > publishes a passed try',
      'e2e (1)\tRun\t2026-11-13T14:57:06Z ^[[41m^[[1m FAIL ^[[22m^[[49m e2e/gallery.e2e.test.ts^[[2m > ^[[22mgallery links^[[2m > ^[[22mopens the scene',
      'e2e (2)\tRun\t2026-11-13T14:57:07Z  ✓ e2e/marks.e2e.test.ts (6 tests)',
    ].join('\n');

    expect(failedTests(log)).toEqual([
      'e2e/drive.e2e.test.ts > Cases > publishes a passed try',
      'e2e/gallery.e2e.test.ts > gallery links > opens the scene',
    ]);
  });

  it('counts a run on main or a batch that passed only when run again', () => {
    expect(passedOnRerun({ headBranch: 'main', conclusion: 'success', attempt: 2 })).toBe(true);
    expect(passedOnRerun({ headBranch: 'loop/batch/1', conclusion: 'success', attempt: 2 })).toBe(true);
    expect(passedOnRerun({ headBranch: 'main', conclusion: 'success', attempt: 1 })).toBe(false);
    expect(passedOnRerun({ headBranch: 'loop/refine/x', conclusion: 'success', attempt: 2 })).toBe(false);
  });

  it('files a fix step named after the test, which never asks for a retry or a longer timeout', () => {
    const step = flakeStep('e2e/drive.e2e.test.ts > Cases > publishes a passed try', 'https://example.com/run/1');

    expect(step.title).toBe('Fix: Make the flaky test "publishes a passed try" in e2e/drive.e2e.test.ts deterministic');
    expect(step.body).toContain('Never raise a timeout');
  });
});
