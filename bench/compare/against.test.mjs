import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkoutRef, refFromArgs, refLabel } from './against.mjs';
import { againstArms, armCache, modelArms, TREE_LABEL } from './arms.mjs';
import { liveRunsPlanned, splitSlots } from './plan.mjs';

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=me', '-c', 'user.email=me@example.com', ...args], { cwd, encoding: 'utf8' });

const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};

let tree;
let ref;

beforeEach(() => {
  tree = fs.mkdtempSync(path.join(os.tmpdir(), 'against-test-'));
  git(tree, 'init', '-q', '-b', 'main');
  write(tree, 'electron/cad-agent-prompt.mjs', 'export default "Build robots.";\n');
  write(tree, 'bench/micro/tasks/a1.mjs', 'export const grade = () => true;\n');
  write(tree, 'package-lock.json', '{}\n');
  git(tree, 'add', '-A');
  git(tree, 'commit', '-q', '-m', 'start');
  ref = checkoutRef({ cwd: tree, ref: 'main' });
});

afterEach(() => {
  ref.remove();
  fs.rmSync(tree, { recursive: true, force: true });
});

const armsNow = () => againstArms({ model: 'claude-opus-5-5', tree, ref, gitOf: () => ({ commit: 'x' }) });

describe('compare --against', () => {
  it('checks the ref out on its own and removes it afterwards', () => {
    expect(fs.existsSync(path.join(ref.dir, 'electron/cad-agent-prompt.mjs'))).toBe(true);
    expect(ref.label).toBe('main');

    ref.remove();

    expect(fs.existsSync(ref.dir)).toBe(false);
    expect(git(tree, 'worktree', 'list')).not.toContain(path.basename(ref.dir));
  });

  it('builds one snapshot per harness, from each checkout, with different hashes', () => {
    write(tree, 'electron/cad-agent-prompt.mjs', 'export default "Build robots that can be serviced.";\n');

    const [here, there] = armsNow();

    expect(here).toMatchObject({ label: TREE_LABEL, source: tree, cache: false });
    expect(there).toMatchObject({ label: 'main', source: ref.dir, cache: true });
    expect(here.harness).not.toBe(there.harness);
  });

  it('refuses when nothing the agent depends on differs', () => {
    write(tree, 'electron/notes.md', 'A guide change outside the harness.\n');

    expect(armsNow).toThrow('have the same harness');
  });

  it('refuses when the tasks and graders differ, since one grader scores both', () => {
    write(tree, 'electron/cad-agent-prompt.mjs', 'export default "Changed.";\n');
    write(tree, 'bench/micro/tasks/a1.mjs', 'export const grade = () => false;\n');

    expect(armsNow).toThrow('different tasks and graders (bench/micro)');
  });

  it('reads the ref from the flag, defaulting to main, and shortens a full commit', () => {
    expect(refFromArgs(['--against', '--dry'])).toBe('main');
    expect(refFromArgs(['--against', 'origin/main'])).toBe('origin/main');
    expect(refLabel('9fb225cfa1b2c3d4e5f60718293a4b5c6d7e8f90')).toBe('9fb225c');
  });
});

const entry = (task, harness, grade = 'pass') => ({
  kind: 'micro',
  task,
  harness,
  grade,
  effort: 'high',
  servedBy: 'claude-opus-5-5',
  at: '2026-11-13T00:00:00Z',
  run: `r-${harness}`,
});

describe('the baseline cache', () => {
  const index = [entry('A1', 'tree'), entry('A1', 'ref'), entry('A2', 'ref', 'fail')];
  const arms = [
    { label: TREE_LABEL, model: 'claude-opus-5-5', harness: 'tree', cache: false },
    { label: 'main', model: 'claude-opus-5-5', harness: 'ref', cache: true },
  ];

  it("serves the ref's runs and never the working tree's", () => {
    const [here, there] = arms.map((arm) => armCache(index, arm, { effort: 'high', useCache: true }));

    expect(here.size).toBe(0);
    expect([...there.keys()]).toEqual(['A1', 'A2']);
    expect(there.get('A1')[0].run).toBe('r-ref');
  });

  it('serves nothing with --no-cache, for an alias, or at another effort', () => {
    expect(armCache(index, arms[1], { effort: 'high', useCache: false }).size).toBe(0);
    expect(armCache(index, { ...arms[1], model: 'opus' }, { effort: 'high', useCache: true }).size).toBe(0);
    expect(armCache(index, arms[1], { effort: 'low', useCache: true }).size).toBe(0);
  });

  it('keeps comparing models on one harness, both cached', () => {
    const both = modelArms({ labels: ['claude-opus-5-5', 'fable'], harness: 'ref', source: tree, git: {} });

    expect(both.map((arm) => arm.cache)).toEqual([true, true]);
    expect(armCache(index, both[0], { effort: 'high', useCache: true }).size).toBe(2);
  });
});

describe('the plan', () => {
  const tasks = [{ id: 'A1' }, { id: 'A2' }, { id: 'A3' }];

  it('counts only the seeds the cache lacks as live runs', () => {
    const cached = new Map([
      ['A1', [{}, {}, {}]],
      ['A2', [{}]],
    ]);

    expect(liveRunsPlanned({ tasks, rounds: 3, caches: [new Map(), cached] })).toEqual([9, 5]);
  });

  it('splits slots by live runs, and opens no app for a side the cache covers', () => {
    expect(splitSlots(8, [9, 0])).toEqual([8, 0]);
    expect(splitSlots(8, [30, 30])).toEqual([4, 4]);
    expect(splitSlots(4, [30, 5])).toEqual([3, 1]);
    expect(splitSlots(1, [3, 3])).toEqual([1, 1]);
  });
});
