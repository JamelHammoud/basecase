import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { runMicroOnce } from '../micro/once.mjs';
import { readIndex } from '../archive.mjs';
import { guardedOutput } from './runtime.mjs';

it('does not archive a late passing grade from a timed-out comparison task', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-archive-'));
  const controller = new AbortController();
  const scene = { parts: [], project: {} };
  let grading;
  let release;
  const ready = new Promise((resolve) => {
    grading = resolve;
  });
  const task = {
    id: 'late',
    startScene: async () => scene,
    grade: () => {
      grading();

      return new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  const slot = {
    post: async () => ({}),
    api: async () => scene,
    onEvent: { current: null },
    studio: { page: {} },
  };

  try {
    const work = runMicroOnce({
      task,
      slot,
      seed: 1,
      out: guardedOutput({ dir, runsDir: dir, runName: 'late', git: {} }, controller.signal),
    });

    await ready;
    controller.abort(new Error('task-timeout'));
    release({ status: 'pass', checks: [] });
    await expect(work).rejects.toThrow('task-timeout');
    expect(readIndex(dir)).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'late', 'seed-1', 'summary.json'))).toBe(false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it('rejects provider refusals before grading or archiving', async () => {
  vi.useFakeTimers();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-refused-'));
  const grade = vi.fn();
  const scene = { parts: [], project: {} };
  const slot = { post: async () => ({}), api: async () => scene, onEvent: { current: null }, studio: { page: {} } };

  try {
    const work = runMicroOnce({
      task: { id: 'refused', startScene: async () => scene, grade },
      slot,
      seed: 1,
      out: { dir, runsDir: dir, runName: 'refused', git: {} },
      verifyModel: { arg: 'claude-opus-5-5', expectServed: 'claude-opus-5-5' },
    });
    const check = expect(work).rejects.toMatchObject({ code: 'served' });

    await vi.runAllTimersAsync();
    await check;
    expect(grade).not.toHaveBeenCalled();
    expect(readIndex(dir)).toEqual([]);
  } finally {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
