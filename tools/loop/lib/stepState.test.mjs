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
});
