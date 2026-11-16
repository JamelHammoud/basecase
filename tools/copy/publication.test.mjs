import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { copyReport } from '../loop/lib/copy.mjs';
import { copyProblems } from '../loop/lib/preflight.mjs';
import { copyLines, pullBody, revisedBody } from '../loop/lib/pull.mjs';
import { voiceText } from '../voice/voice.mjs';
import { copyDiffOfRange, copyOccurrences } from '../copy-diff.mjs';

const command = fileURLToPath(new URL('../check-copy-budget.mjs', import.meta.url));

it('rejects missing occurrence reasons and preserves complete publication and review evidence without publishing', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-publication-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });

    if (result.status !== 0) throw new Error(result.stderr);

    return result.stdout.trim();
  };
  const write = (file, source) => {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), source);
  };
  const commit = () => {
    git('add', '-A');
    git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture');
  };
  const check = (body) =>
    spawnSync(process.execPath, [command, 'main..HEAD'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, PR_BODY: body },
    });

  try {
    git('init', '-q', '-b', 'main');
    write('src/View.tsx', '<button>Close</button>');
    commit();
    git('checkout', '-qb', 'step');
    write('src/View.tsx', '<><button>Close</button><button>Close</button><button>Close</button></>');
    write('electron/app-menu.mjs', "item('Open Scene', 'open-scene');");
    commit();

    const occurrences = copyOccurrences(copyDiffOfRange({ cwd, base: 'main', head: 'HEAD' }));
    const copy = [
      { string: 'Close', why: 'Closes each independently opened panel' },
      { string: 'Open Scene', why: 'Opens the scene picker from the native menu' },
    ];
    const change = { kind: 'refine', summary: 'Summary', why: 'Why', checked: 'Checked', copy };
    const options = { branch: 'loop/copy-fixture', slug: 'example/basecase' };
    const body = pullBody(change, options);
    const missing = check('');
    const partial = check(copyLines(copy.slice(1)));
    const complete = check(body);
    const review = copyReport(cwd, { base: 'main', body });

    expect(missing.status, missing.stderr).toBe(1);
    expect(partial.status, partial.stderr).toBe(1);
    expect(complete.status, complete.stderr).toBe(0);
    expect(complete.stdout).toContain('Copy: +3 −0');
    expect(copyProblems({ ...occurrences, copy })).toEqual([]);
    expect(copyProblems({ ...occurrences, copy: copy.slice(1) })).toHaveLength(2);
    expect(review.net).toBe(3);
    expect(review.text).toContain(complete.stdout.trim());
    expect(review.text.match(/why: Closes each independently opened panel/g)).toHaveLength(2);
    expect(revisedBody(body, change, options)).toContain(copyLines(copy));

    for (const kind of ['issue', 'pull']) {
      const input = kind === 'issue' ? `Arc: #224\n\n${copyLines(copy)}` : body;
      const generate = () => ({ ok: true, output: { text: input.replace('Summary', 'Revised summary') } });

      expect(voiceText(input, { kind, generate })).toContain(copyLines(copy));
      expect(voiceText(input, { kind, generate: () => ({ ok: true, output: { text: 'Lost reasons' } }) })).toBeNull();
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
