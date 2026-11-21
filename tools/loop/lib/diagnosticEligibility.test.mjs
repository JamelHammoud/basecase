import { expect, it, vi } from 'vitest';

const proof = vi.hoisted(() => ({ ready: false }));

vi.mock('./diagnosticReadiness.mjs', () => ({ windowsDiagnosticsReady: () => proof.ready }));

import { availableCapabilities, unavailableCapabilities } from './capabilities.mjs';
import { normalizeDiagnosticRequirements } from './groom.mjs';

const body =
  'Requires: windows-diagnostics\nTrace the failure and restore deterministic coverage for `e2e/gallery.e2e.test.ts`.\n\nDepends on #19.\nMeasure at least ten Windows runs before and ten after at the same CI-like load. Keep the existing assertions and deadlines, add no retries and remove only these quarantine entries when the measurements establish the fix.';

it('unblocks the existing gallery owner only after retrieved Windows proof and preserves its scope and dependencies', () => {
  const owner = { number: 1139, title: 'Restore gallery browser tests', body, assignees: ['original-owner'] };
  const writes = [];
  const gh = {
    claim: () => () => {},
    issueNow: () => ({ ...owner, state: 'OPEN' }),
    setIssueBody: (...args) => writes.push(args),
  };

  proof.ready = false;
  expect(unavailableCapabilities(owner)).toEqual(['windows-diagnostics']);
  expect(normalizeDiagnosticRequirements([owner], { verified: false, gh })).toEqual([]);
  expect(writes).toEqual([]);

  proof.ready = true;
  expect(availableCapabilities()).toContain('windows-diagnostics');
  expect(unavailableCapabilities(owner)).toEqual([]);
  expect(normalizeDiagnosticRequirements([owner], { verified: true, gh, log: () => {} })).toEqual(['normalized']);
  expect(writes).toEqual([[1139, body.replace('Requires: windows-diagnostics', 'Requires: windows-ci')]]);
  expect(owner.assignees).toEqual(['original-owner']);
  expect(unavailableCapabilities({ requires: ['windows-host', 'physical-robot'] })).toEqual([
    'windows-host',
    'physical-robot',
  ]);
  proof.ready = false;
});

it('keeps interactive owners, unrelated steps, claimed work and changed bodies out of normalization', () => {
  const owner = { number: 1139, title: 'Gallery', body };
  const setIssueBody = vi.fn();
  const gh = { claim: () => null, issueNow: () => ({ state: 'OPEN', body: 'changed' }), setIssueBody };

  expect(normalizeDiagnosticRequirements([owner], { verified: true, gh })).toEqual([
    'skipped #1139: a builder holds it',
  ]);
  gh.claim = () => () => {};
  expect(normalizeDiagnosticRequirements([owner], { verified: true, gh })).toEqual([
    'skipped #1139: its body changed since it was sent',
  ]);
  expect(
    normalizeDiagnosticRequirements([{ ...owner, body: `${body}\nRequires a Windows host.` }], { verified: true, gh }),
  ).toEqual(['kept']);
  expect(normalizeDiagnosticRequirements([{ ...owner, number: 992 }], { verified: true, gh })).toEqual([]);
  expect(setIssueBody).not.toHaveBeenCalled();
});
