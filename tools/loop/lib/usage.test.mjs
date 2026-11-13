import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-'));

vi.stubEnv('BASECASE_LOOP_DIR', dir);

const { limitIn, pause, probeDue, resume, startPause } = await import('./usage.mjs');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const NOW = Date.UTC(2026, 10, 13, 12);
const RESET = NOW / 1000 + 3600;

describe('usage limit', () => {
  it('reads the reset time from a rejected rate limit, wherever it sits in the output', () => {
    const events = [
      { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: RESET } },
      {
        type: 'result',
        is_error: true,
        apiErrorParams: { rate_limit_info: { status: 'rejected', resetsAt: RESET, rateLimitType: 'five_hour' } },
      },
    ];

    expect(limitIn({ out: JSON.stringify(events) }, NOW)).toEqual({ until: RESET * 1000 });
  });

  it('falls back to half an hour when only the message says so', () => {
    const out = JSON.stringify({ type: 'result', is_error: true, result: "You've hit your 5-hour limit · resets 3pm" });

    expect(limitIn({ out }, NOW)).toEqual({ until: NOW + 30 * 60 * 1000 });
  });

  it('ignores ordinary failures, warnings and resets already past', () => {
    const past = JSON.stringify({ rate_limit_info: { status: 'rejected', resetsAt: NOW / 1000 - 60 } });

    expect(limitIn({ out: '{"type":"result","is_error":true,"result":"Tests failed"}' }, NOW)).toBeNull();
    expect(limitIn({ out: '', err: 'spawn claude ENOENT' }, NOW)).toBeNull();
    expect(limitIn({ out: past }, NOW)).toBeNull();
  });

  it('announces a pause once, keeps the latest reset, and probes every 15 minutes', () => {
    expect(startPause(NOW + 1000, NOW)).toBe(true);
    expect(startPause(NOW + 5000, NOW + 10)).toBe(false);
    expect(pause()).toMatchObject({ since: NOW, until: NOW + 5000 });
    expect(probeDue(NOW + 14 * 60 * 1000)).toBe(false);
    expect(probeDue(NOW + 16 * 60 * 1000)).toBe(true);
    expect(probeDue(NOW + 17 * 60 * 1000)).toBe(false);

    resume();

    expect(pause()).toBeNull();
    expect(probeDue(NOW)).toBe(false);
  });
});
