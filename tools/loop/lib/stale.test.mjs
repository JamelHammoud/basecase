import { describe, expect, it } from 'vitest';
import { laneOf, parseRefs, parseWorktrees, staleBranches, staleWorktrees } from './stale.mjs';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-11-12T12:00:00Z');
const ROOT = '/home/me/.basecase-loop/worktrees';

describe('staleBranches', () => {
  const branch = (name, hoursOld) => ({ name, committedAt: NOW - hoursOld * HOUR });
  const branches = [
    branch('loop/build/old-step', 30),
    branch('loop/build/fresh-step', 2),
    branch('loop/repair/open-fix', 48),
    branch('main', 100),
    branch('feature/mine', 100),
    branch('loop/', 100),
    branch('looper/x', 100),
  ];

  it('picks loop branches over a day old with no open pull request', () => {
    expect(staleBranches({ branches, keep: ['loop/repair/open-fix'], now: NOW })).toEqual(['loop/build/old-step']);
  });

  it('never picks main or a branch outside loop/', () => {
    const picked = staleBranches({ branches, keep: [], now: NOW, maxAgeMs: 0 });

    expect(picked).not.toContain('main');
    expect(picked).not.toContain('feature/mine');
    expect(picked).not.toContain('looper/x');
  });

  it('reads for-each-ref lines', () => {
    expect(parseRefs('loop/build/a 1700000000\nloop/fix/b 1700000060\n')).toEqual([
      { name: 'loop/build/a', committedAt: 1700000000000 },
      { name: 'loop/fix/b', committedAt: 1700000060000 },
    ]);
  });
});

describe('staleWorktrees', () => {
  const porcelain = [
    `worktree /home/me/.basecase-loop/home\nHEAD abc\ndetached`,
    `worktree ${ROOT}/loop-build-step-202611101200\nHEAD abc\nbranch refs/heads/loop/build/step-202611101200`,
    `worktree ${ROOT}/review-12-abc1234\nHEAD abc\ndetached`,
    `worktree ${ROOT}/rebase-9\nHEAD abc\nbranch refs/heads/loop/fix/thing`,
    `worktree ${ROOT}/learn\nHEAD abc\nbranch refs/heads/loop/build/learn`,
    `worktree ${ROOT}/loop-refine-fit-202611121100\nHEAD abc\nbranch refs/heads/loop/refine/fit-202611121100`,
    '',
  ].join('\n\n');
  const listed = parseWorktrees(porcelain);
  const ages = { 'loop-refine-fit-202611121100': 1 };
  const aged = listed.map((w) => ({ ...w, createdAt: NOW - (ages[w.dir.split('/').at(-1)] ?? 30) * HOUR }));
  const names = (list) => list.map((w) => w.dir.split('/').at(-1));

  it('parses git worktree list', () => {
    expect(listed).toHaveLength(6);
    expect(listed[1]).toEqual({
      dir: `${ROOT}/loop-build-step-202611101200`,
      branch: 'loop/build/step-202611101200',
    });
    expect(listed[2].branch).toBeNull();
  });

  it('names the lane that made a worktree', () => {
    expect(laneOf('loop-build-step-202611101200')).toBe('build');
    expect(laneOf('review-12-abc1234')).toBe('review');
    expect(laneOf('rebase-9')).toBe('rebase');
  });

  it('removes old loop worktrees only, and none whose lane holds its lock', () => {
    expect(names(staleWorktrees({ worktrees: aged, root: ROOT, held: [], now: NOW }))).toEqual([
      'loop-build-step-202611101200',
      'review-12-abc1234',
      'rebase-9',
    ]);
    expect(names(staleWorktrees({ worktrees: aged, root: ROOT, held: ['build-2', 'review'], now: NOW }))).toEqual([
      'rebase-9',
    ]);
  });
});
