import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const roots = [];

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function fixture(note) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-docs-'));

  roots.push(root);
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs/guide'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs/notes'), { recursive: true });
  fs.copyFileSync(new URL('./check-docs.mjs', import.meta.url), path.join(root, 'tools/check-docs.mjs'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '[Performance](docs/guide/performance.md)\n');
  fs.writeFileSync(
    path.join(root, 'docs/guide/performance.md'),
    '## 0f. Performance\n\n[Evidence](../notes/viewport.md)\n',
  );
  fs.writeFileSync(path.join(root, 'docs/notes/viewport.md'), note);
  expect(spawnSync('git', ['init', '--quiet'], { cwd: root }).status).toBe(0);

  return root;
}

function check(note) {
  return spawnSync(process.execPath, ['tools/check-docs.mjs'], { cwd: fixture(note), encoding: 'utf8' });
}

it('follows guide-to-note navigation without requiring notes in the root guide index', () => {
  const result = check('[Rules](../guide/performance.md#0f-performance) (§0f).\n');

  expect(result.status, result.stderr).toBe(0);
});

it('rejects broken local links and section references in subsystem evidence', () => {
  const result = check('[Missing](./missing.md) (§99).\n');

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('docs/notes/viewport.md: link to ./missing.md goes nowhere');
  expect(result.stderr).toContain('docs/notes/viewport.md: §99 names no section');
});
