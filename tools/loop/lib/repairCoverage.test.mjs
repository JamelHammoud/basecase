import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { run } from './sh.mjs';
import { expandsTestExclusions } from './repairCoverage.mjs';

let dir;
const original = { file: 'src/source.test.ts', test: 'keeps evidence', platform: 'win32', until: '2026-11-28' };
const write = (entries) => fs.writeFileSync(path.join(dir, 'tools/quarantine.json'), JSON.stringify(entries));
const git = (...args) => run('git', args, { cwd: dir });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-coverage-'));
  fs.mkdirSync(path.join(dir, 'tools'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  write([original]);
  git('add', '.');
  git('commit', '-qm', 'Initial coverage');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

it.each(['file', 'test', 'platform', 'until'])('refuses an added or extended %s exclusion', (field) => {
  const changed = { file: 'src/other.test.ts', test: '', platform: 'linux', until: '2026-12-04' };

  write([original, { ...original, [field]: changed[field] }]);
  expect(expandsTestExclusions(dir)).toBe(true);
});

it('allows descriptive updates, shorter exclusions and complete restoration', () => {
  write([{ ...original, until: '2026-11-27', issue: 42, reason: 'Retained evidence' }]);
  expect(expandsTestExclusions(dir)).toBe(false);
  write([]);
  expect(expandsTestExclusions(dir)).toBe(false);
});

it('detects exclusions already committed by an investigation', () => {
  write([original, { ...original, platform: 'linux' }]);
  git('add', '.');
  git('commit', '-qm', 'Proposed exclusion');
  expect(expandsTestExclusions(dir)).toBe(true);
});

it('allows source work without touching test exclusions', () => {
  fs.writeFileSync(path.join(dir, 'source.mjs'), 'export const fixed = true;');
  git('add', '.');
  git('commit', '-qm', 'Source repair');
  expect(expandsTestExclusions(dir)).toBe(false);
});

it('ignores exclusion changes that landed on main after the branch was made', () => {
  git('checkout', '-qb', 'work');
  write([]);
  git('add', '.');
  git('commit', '-qm', 'Main removes the exclusion');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '-q', 'HEAD~1', '-B', 'branch');
  expect(expandsTestExclusions(dir)).toBe(false);
});

it('refuses an unreadable exclusion list', () => {
  fs.writeFileSync(path.join(dir, 'tools/quarantine.json'), '[');
  expect(expandsTestExclusions(dir)).toBe(true);
});
