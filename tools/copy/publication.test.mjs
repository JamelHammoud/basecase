import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { copyReport } from '../loop/lib/copy.mjs';
import { copyProblems } from '../loop/lib/preflight.mjs';
import { copyLines, pullBody, revisedBody } from '../loop/lib/pull.mjs';
import { voiceText } from '../voice/voice.mjs';
import { copyOccurrences, diffCopy } from '../copy-diff.mjs';
import { judge } from './budget.mjs';

const command = fileURLToPath(new URL('../check-copy-budget.mjs', import.meta.url));
const files = [
  {
    file: 'src/View.tsx',
    before: '<button>Close</button>',
    after: '<><button>Close</button><button>Close</button><button>Close</button></>',
  },
  { file: 'electron/app-menu.mjs', before: null, after: "item('Open Scene', 'open-scene');" },
  {
    file: 'electron/dialogs.mjs',
    before: 'const message = "Save scene?";\ndialog.showMessageBox({ message });',
    after:
      'const message = "Save scene?";\ndialog.showMessageBox({ message });\ndialog.showMessageBox({ message });\ndialog.showMessageBox({ message });',
  },
];
const occurrences = copyOccurrences(diffCopy(files));
const copy = [
  { string: 'Close', why: 'Closes each independently opened panel' },
  { string: 'Open Scene', why: 'Opens the scene picker from the native menu' },
  { string: 'Save scene?', why: 'Asks before each independent save operation' },
];
const change = { kind: 'refine', summary: 'Summary', why: 'Why', checked: 'Checked', copy };
const options = { branch: 'loop/copy-fixture', slug: 'example/basecase' };
const body = pullBody(change, options);
let cwd;

beforeAll(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-publication-'));

  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });

    if (result.status !== 0) throw new Error(result.stderr);

    return result.stdout.trim();
  };
  const write = (revision) => {
    for (const entry of files) {
      if (entry[revision] === null) continue;

      fs.mkdirSync(path.dirname(path.join(cwd, entry.file)), { recursive: true });
      fs.writeFileSync(path.join(cwd, entry.file), entry[revision]);
    }
  };
  const commit = () => {
    git('add', '-A');
    git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture');
  };

  git('init', '-q', '-b', 'main');
  write('before');
  commit();
  git('checkout', '-qb', 'step');
  write('after');
  commit();
});

afterAll(() => {
  if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
});

it.each([
  { reasons: 'missing', body: '', status: 1 },
  { reasons: 'complete', body, status: 0 },
])('returns $status from the budget command with $reasons reasons', ({ body, status }) => {
  const result = spawnSync(process.execPath, [command, 'main..HEAD'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PR_BODY: body },
  });

  expect(result.status, result.stderr).toBe(status);
  expect(result.stdout).toContain('Copy: +5 −0');
});

it('rejects partial occurrence reasons and preserves complete publication and review evidence without publishing', () => {
  const review = copyReport(cwd, { base: 'main', body });
  const [accounting] = review.text.split('\n\nSource proximity only,');
  const partial = judge({ ...occurrences, body: copyLines(copy.slice(1)), banned: [] });

  expect(partial.ok).toBe(false);
  expect(partial.unjustified.map(({ text }) => text)).toEqual(['Close', 'Close']);
  expect(copyProblems({ ...occurrences, copy })).toEqual([]);
  expect(copyProblems({ ...occurrences, copy: copy.slice(1) })).toHaveLength(2);
  expect(copyProblems({ ...occurrences, copy: copy.slice(0, 2) })).toHaveLength(2);
  expect(review.net).toBe(5);

  expect(accounting).toBe(
    [
      '+ "Open Scene"  electron/app-menu.mjs:1  (why: Opens the scene picker from the native menu)',
      '+ "Save scene?"  electron/dialogs.mjs:3  (why: Asks before each independent save operation)',
      '+ "Save scene?"  electron/dialogs.mjs:4  (why: Asks before each independent save operation)',
      '+ "Close"  src/View.tsx:1  (why: Closes each independently opened panel)',
      '+ "Close"  src/View.tsx:1  (why: Closes each independently opened panel)',
      '',
      'Copy: 5 added, 0 changed, 0 removed, net +5',
    ].join('\n'),
  );
  expect(copyReport(cwd, { base: 'main', body: '' }).text.match(/why: MISSING/g)).toHaveLength(5);
  expect(review.text).not.toContain('why: MISSING');
  expect(review.text.match(/why: Closes each independently opened panel/g)).toHaveLength(2);
  expect(review.text.match(/why: Asks before each independent save operation/g)).toHaveLength(2);
  expect(review.text).toContain('electron/dialogs.mjs:3');
  expect(review.text).toContain('electron/dialogs.mjs:4');
  expect(revisedBody(body, change, options)).toContain(copyLines(copy));

  for (const kind of ['issue', 'pull']) {
    const input = kind === 'issue' ? `Arc: #224\n\n${copyLines(copy)}` : body;
    const generate = () => ({ ok: true, output: { text: input.replace('Summary', 'Revised summary') } });

    expect(voiceText(input, { kind, generate })).toContain(copyLines(copy));
    expect(voiceText(input, { kind, generate: () => ({ ok: true, output: { text: 'Lost reasons' } }) })).toBeNull();
  }
});
