import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-state-'));

vi.stubEnv('BASECASE_LOOP_DIR', dir);

const { recordDecline, stepEntry, stepWaiting } = await import('./stepState.mjs');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const MINUTE = 60 * 1000;

describe('step backoff', () => {
  it('doubles the wait after each decline, up to a day', () => {
    const waits = [1, 2, 3, 4, 5, 6, 7, 8].map(() => recordDecline(7, { now: 0, waitFor: [] }).until / MINUTE);

    expect(waits).toEqual([30, 60, 120, 240, 480, 960, 1440, 1440]);
  });

  it('waits while a pull request it named is open, even after the time passes', () => {
    const entry = recordDecline(8, { now: 0, waitFor: [52] });
    const later = entry.until + 1;

    expect(stepWaiting(entry, { now: later, openNumbers: new Set([52]) })).toBe(true);
    expect(stepWaiting(entry, { now: later, openNumbers: new Set() })).toBe(false);
    expect(stepWaiting(stepEntry(9), { now: 0, openNumbers: new Set([52]) })).toBe(false);
  });

  it('does not spend another session declining unchanged source inputs', () => {
    const entry = recordDecline(10, { now: 0, waitFor: [], inputSignature: 'source-a' });

    expect(stepWaiting(entry, { now: 9e9, openNumbers: new Set(), inputSignature: 'source-a' })).toBe(true);
    expect(stepWaiting(entry, { now: 1, openNumbers: new Set(), inputSignature: 'source-b' })).toBe(false);
  });

  it('reconsiders a named dependency when it closes without requiring a source edit', () => {
    const entry = recordDecline(11, { now: 0, waitFor: [42], inputSignature: 'source-a' });

    expect(stepWaiting(entry, { now: 1, openNumbers: new Set([42]), inputSignature: 'source-a' })).toBe(true);
    expect(stepWaiting(entry, { now: 1, openNumbers: new Set(), inputSignature: 'source-a' })).toBe(false);
  });

  it('keeps an open prerequisite blocking across source changes and retries after it closes', () => {
    const entry = recordDecline(12, { now: 0, waitFor: [42], inputSignature: 'source-a' });

    expect(stepWaiting(entry, { now: 1, openNumbers: new Set([42]), inputSignature: 'source-b' })).toBe(true);
    expect(stepWaiting(entry, { now: 1, openNumbers: new Set(), inputSignature: 'source-b' })).toBe(false);
  });
});

describe('missing execution capabilities', () => {
  it('waits for a known missing capability even when unrelated source inputs change', () => {
    const entry = recordDecline(13, {
      now: 0,
      waitFor: [],
      inputSignature: 'a',
      taskHead: 'task-a',
      missing: ['windows-diagnostics'],
    });

    expect(
      stepWaiting(entry, { now: 9e9, openNumbers: new Set(), inputSignature: 'b', taskHead: 'task-a', available: [] }),
    ).toBe(true);
    expect(
      stepWaiting(entry, {
        now: 1,
        openNumbers: new Set(),
        inputSignature: 'a',
        taskHead: 'task-a',
        available: ['windows-diagnostics'],
      }),
    ).toBe(false);
    expect(
      stepWaiting(entry, { now: 1, openNumbers: new Set(), inputSignature: 'a', taskHead: 'task-b', available: [] }),
    ).toBe(false);
  });

  it('keeps a named dependency blocking after a missing capability becomes available', () => {
    const entry = recordDecline(14, { now: 0, waitFor: [99], taskHead: 'task-a', missing: ['windows-diagnostics'] });
    const context = { now: 1, taskHead: 'task-a', available: ['windows-diagnostics'] };

    expect(stepWaiting(entry, { ...context, openNumbers: new Set([99]) })).toBe(true);
    expect(stepWaiting(entry, { ...context, openNumbers: new Set() })).toBe(false);
  });

  it('keeps named dependencies blocking when capability availability changes the source fingerprint', () => {
    const entry = recordDecline(15, {
      now: 0,
      waitFor: [99],
      taskHead: 'task-a',
      inputSignature: 'source-without-diagnostics',
      missing: ['windows-diagnostics'],
    });
    const context = {
      now: 1,
      taskHead: 'task-a',
      inputSignature: 'source-with-diagnostics',
      available: ['windows-diagnostics'],
    };

    expect(stepWaiting(entry, { ...context, openNumbers: new Set([99]) })).toBe(true);
    expect(stepWaiting(entry, { ...context, openNumbers: new Set() })).toBe(false);
  });
});
