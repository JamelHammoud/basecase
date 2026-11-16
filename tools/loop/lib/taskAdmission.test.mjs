import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-admission-'));
const calls = vi.hoisted(() => ({
  run: vi.fn(() => ({ out: 'https://example.com/issues/1', ok: true })),
  voice: vi.fn((body) => body),
}));

vi.stubEnv('BASECASE_LOOP_DIR', directory);
vi.mock('./sh.mjs', () => ({ run: calls.run, json: () => [] }));
vi.mock('./voiceHook.mjs', () => ({ voiced: calls.voice }));

const { createIssue } = await import('./github.mjs');

afterEach(() => vi.clearAllMocks());
afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('task admission before publication', () => {
  it('files no executable issue and spends no writing call for an unavailable host', () => {
    expect(
      createIssue({
        title: 'Measure Windows rendering',
        body: 'Requires: windows-host\nMeasure ten runs.',
        labels: ['loop:next'],
      }),
    ).toBeNull();
    expect(calls.run).not.toHaveBeenCalled();
    expect(calls.voice).not.toHaveBeenCalled();
  });

  it.each([
    'Use a Windows run on a branch and measure at least ten runs before and ten after at equal load.',
    'Collect five baseline and five candidate Windows runs before publication.',
    'Capture Windows process traces before publication.',
  ])('rejects Windows diagnostics before voice or publication even when they only declare CI: %s', (diagnostics) => {
    expect(
      createIssue({
        title: 'Make a Windows lifecycle failure deterministic',
        body: `Requires: windows-ci\n\n${diagnostics}`,
        labels: ['loop:next'],
      }),
    ).toBeNull();
    expect(calls.run).not.toHaveBeenCalled();
    expect(calls.voice).not.toHaveBeenCalled();
  });

  it('allows a Windows CI task and keeps an unsupported idea outside execution', () => {
    expect(
      createIssue({
        title: 'Verify Windows packaging',
        body: 'Requires: windows-ci\nVerify the package in CI.',
        labels: ['loop:next'],
      }),
    ).toBe('https://example.com/issues/1');
    expect(createIssue({ title: 'Future robot test', body: 'Requires: physical-robot', labels: ['loop:idea'] })).toBe(
      'https://example.com/issues/1',
    );
    expect(calls.run).toHaveBeenCalledTimes(2);
  });
});
