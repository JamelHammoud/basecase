import { describe, expect, it } from 'vitest';
import { canaryVerdict } from './canary.mjs';

const report = (status, failureMessages = []) => ({
  testResults: [{ assertionResults: [{ title: 'canary x', status, failureMessages }] }],
});

describe('a canary fires only on its own assertion', () => {
  it('fires when the planted fault fails an expect', () => {
    expect(canaryVerdict(report('failed', ['AssertionError: expected false to be true']), 'canary x').fired).toBe(true);
  });

  it('does not fire when the planted fault passes', () => {
    expect(canaryVerdict(report('passed'), 'canary x')).toMatchObject({ fired: false });
  });

  it('does not fire when the test crashed or never loaded', () => {
    expect(canaryVerdict(report('failed', ['TypeError: x is not a function']), 'canary x').fired).toBe(false);
    expect(canaryVerdict({ testResults: [{ status: 'failed', assertionResults: [] }] }, 'canary x').fired).toBe(false);
    expect(canaryVerdict(null, 'canary x').fired).toBe(false);
  });

  it('does not fire when the named test was skipped', () => {
    expect(canaryVerdict(report('skipped'), 'canary x').fired).toBe(false);
  });
});
