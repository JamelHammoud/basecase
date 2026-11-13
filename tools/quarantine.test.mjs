import { describe, expect, it } from 'vitest';
import { activeEntries, configFor, entryMatches, quarantineExclude, validateQuarantine } from './quarantine.mjs';

const exists = () => true;
const entry = (overrides = {}) => ({
  file: 'e2e/smoke.e2e.test.ts',
  test: 'boots',
  issue: 12,
  until: '2026-12-01',
  reason: 'Times out under load',
  ...overrides,
});

describe('quarantine list', () => {
  it('accepts well-formed entries, including a whole file', () => {
    expect(validateQuarantine([entry(), entry({ test: '', file: 'src/a.test.ts' })], { exists })).toEqual([]);
  });

  it('rejects a list that is not an array', () => {
    expect(validateQuarantine({}, { exists })).toHaveLength(1);
  });

  it.each([
    ['no date', { until: undefined }],
    ['an empty date', { until: '' }],
    ['a date in another format', { until: '12/01/2026' }],
    ['a date that does not exist', { until: '2026-02-30' }],
    ['a month that does not exist', { until: '2026-13-01' }],
    ['no issue', { issue: undefined }],
    ['an issue that is not a number', { issue: '12' }],
    ['no reason', { reason: ' ' }],
    ['a test that is not a string', { test: null }],
    ['a file no run includes', { file: 'e2e/app/kernel.app.test.ts' }],
    ['a file outside the tests', { file: 'src/a.ts' }],
    ['an unknown key', { owner: 'someone' }],
  ])('rejects an entry with %s', (_label, overrides) => {
    const broken = Object.fromEntries(Object.entries(entry(overrides)).filter(([, value]) => value !== undefined));

    expect(validateQuarantine([broken], { exists })).not.toEqual([]);
  });

  it('rejects a missing file and a repeated entry', () => {
    expect(validateQuarantine([entry()], { exists: () => false })).toEqual([
      "Entry 1 names a file that doesn't exist: e2e/smoke.e2e.test.ts",
    ]);
    expect(validateQuarantine([entry(), entry()], { exists })).toEqual(['Entry 2 repeats an earlier entry']);
  });

  it('keeps an entry only while its date is in the future', () => {
    const list = [entry({ until: '2026-11-20' })];

    expect(activeEntries(list, '2026-11-19')).toHaveLength(1);
    expect(activeEntries(list, '2026-11-20')).toEqual([]);
  });

  it('excludes whole files that are still quarantined', () => {
    const list = [entry({ test: '' }), entry({ test: '', file: 'src/b.test.ts', until: '2026-01-01' }), entry()];

    expect(quarantineExclude(list, '2026-11-12')).toEqual(['e2e/smoke.e2e.test.ts']);
  });

  it('matches a test by its own name or its full name', () => {
    const named = entry({ test: 'smoke > boots' });

    expect(entryMatches(entry(), { file: 'e2e/smoke.e2e.test.ts', name: 'boots', fullName: 'smoke > boots' })).toBe(
      true,
    );
    expect(entryMatches(named, { file: 'e2e/smoke.e2e.test.ts', name: 'boots', fullName: 'smoke > boots' })).toBe(true);
    expect(entryMatches(entry(), { file: 'e2e/other.e2e.test.ts', name: 'boots', fullName: 'boots' })).toBe(false);
  });

  it('sends each file to the run that includes it', () => {
    expect(configFor('e2e/smoke.e2e.test.ts')).toBe('vitest.e2e.config.ts');
    expect(configFor('tools/quarantine.test.mjs')).toBe('vitest.config.ts');
    expect(configFor('e2e/app/smoke.app.test.ts')).toBeNull();
  });
});
