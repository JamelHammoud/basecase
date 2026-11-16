import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-issue-'));
const calls = vi.hoisted(() => ({
  run: vi.fn(() => ({ out: 'https://example.com/issues/1', ok: true })),
  generate: vi.fn(({ prompt }) => ({ ok: true, output: { text: prompt.replace('Original facts', 'Revised facts') } })),
}));

vi.stubEnv('BASECASE_LOOP_DIR', directory);
vi.mock('../loop/lib/sh.mjs', () => ({ run: calls.run, json: () => [] }));
vi.mock('../loop/lib/voiceHook.mjs', async () => {
  const { voiceText } = await import('../voice/voice.mjs');

  return { voiced: (body, kind) => voiceText(body, { kind, generate: calls.generate }) ?? body };
});

const { createIssue } = await import('../loop/lib/github.mjs');

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('prepares generated issue bodies through the ordinary voice path without publishing or another model call', () => {
  const reason = '- copy:"Close" - Closes this pane; the same control also closes the tab';
  const body = `Arc: #224\nOriginal facts\n\n${reason}`;

  expect(createIssue({ title: 'Copy evidence fixture', body, labels: ['loop:idea'] })).toBe(
    'https://example.com/issues/1',
  );
  expect(calls.generate).toHaveBeenCalledTimes(1);
  expect(calls.run).toHaveBeenCalledTimes(1);
  expect(calls.run.mock.calls[0]).toEqual([
    'gh',
    ['issue', 'create', '--title', 'Copy evidence fixture', '--body-file', '-', '--label', 'loop:idea'],
    { input: `Arc: #224\nRevised facts\n\n${reason}`, allowFail: true },
  ]);
});
