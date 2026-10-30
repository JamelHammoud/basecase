import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { specToPart } from '../../src/agent/agentScene';
import { parseBomTotal, parseCheckRows } from './adapters.mjs';
import { gradeTask } from './grade.mjs';
import { recordFromFixture } from './materialize.mjs';
import { passHatK, suiteStats, statsMarkdown } from './stats.mjs';
import { SEED_TASKS, selectTasks, stubTasks } from './tasks/index.mjs';

const build = (fixture) => recordFromFixture(fixture, specToPart);
const task = (id) => SEED_TASKS.find((t) => t.id === id);

describe('seed tasks', () => {
  it('covers the 29 seed tasks with a held-out third', () => {
    expect(SEED_TASKS).toHaveLength(29);
    expect(new Set(SEED_TASKS.map((t) => t.id)).size).toBe(29);
    expect(selectTasks({ split: 'heldout' })).toHaveLength(10);
    expect(selectTasks({ split: 'tune' }).some((t) => t.heldOut)).toBe(false);
  });

  it('never passes a broken start scene, and passes every known fix', async () => {
    for (const t of SEED_TASKS.filter((x) => x.fixture)) {
      const start = await build(t.fixture());
      const atStart = await gradeTask(t, { before: start, after: start });

      expect([t.id, atStart.status]).not.toEqual([t.id, 'pass']);
      expect([t.id, atStart.status]).not.toEqual([t.id, 'error']);

      if (!t.solution && !t.solutionAnswer) continue;

      const fixed = t.solution ? await build(t.solution()) : start;
      const graded = await gradeTask(t, { before: start, after: fixed, answer: t.solutionAnswer });

      expect([t.id, graded.status]).toEqual([t.id, 'pass']);
    }
  }, 60000);
});

describe('graders', () => {
  it('catches a part nudged a few tenths to quiet check_scene', async () => {
    const start = await build(task('I2').fixture());
    const nudged = {
      ...start,
      parts: start.parts.map((p) =>
        p.id === 'torso-shell' ? { ...p, position: [p.position[0] + 0.3, p.position[1], p.position[2]] } : p,
      ),
    };
    const grade = await gradeTask(task('I2'), { before: start, after: nudged });

    expect(grade.checks.find((c) => /nudged/.test(c.name))).toMatchObject({
      pass: false,
      detail: 'Nudged: torso-shell',
    });
  });

  it('catches horn screws turned into references to dodge the sweep', async () => {
    const start = await build(task('I3').fixture());
    const dodged = {
      ...start,
      parts: start.parts.map((p) => (p.kind === 'hardware' ? { ...p, role: 'reference' } : p)),
    };
    const grade = await gradeTask(task('I3'), { before: start, after: dodged });

    expect(grade.status).toBe('fail');
  });

  it('uses the running app for the BOM and engineering rows when it has one', async () => {
    const start = await build(task('C1').fixture());
    const app = {
      call: async (kind) => ({
        text:
          kind === 'bom'
            ? 'Budget $350.00. Checked prices total $0.00 (0 checked, 0 stale). With list-price estimates for the rest: ~$312.40.'
            : 'PASS · Weight: 1.2 kg\nWARN · Servo torque: knee at 0.5 of stall\nFAIL · Range of motion: clips',
      }),
    };
    const grade = await gradeTask(task('C1'), { before: start, after: start, app });

    expect(grade.status).toBe('pass');
    expect(parseBomTotal('Budget $1,200.00. … With list-price estimates for the rest: ~$1,312.40.')).toMatchObject({
      estimatedUsd: 1312.4,
      budgetUsd: 1200,
    });
    expect(parseCheckRows('FAIL · Range of motion: clips\nnoise')).toEqual([
      { check: 'Range of motion', status: 'fail', detail: 'clips' },
    ]);
  });

  it('marks a task unavailable, not failed, when its check has not landed', async () => {
    const start = await build(task('K4').fixture());
    const grade = await gradeTask(task('K4'), { before: start, after: start });

    expect(grade).toMatchObject({ status: 'unavailable', needs: ['craft'] });

    const wired = await gradeTask(task('K4'), {
      before: start,
      after: start,
      adapters: { craft: () => ({ pass: false, detail: '4 parts over 0.85 solidity' }) },
    });

    expect(wired.status).toBe('fail');
  });
});

describe('suite stats', () => {
  it('reports pass^k per task and keeps the held-out set apart', () => {
    expect(passHatK(3, 3, 3)).toBe(1);
    expect(passHatK(3, 2, 3)).toBe(0);
    expect(passHatK(4, 2, 2)).toBeCloseTo(1 / 6);

    const results = [
      ...[1, 2, 3].map((seed) => ({
        task: 'A1',
        category: 'assembly',
        seed,
        status: seed < 3 ? 'pass' : 'fail',
        costUsd: 0.5,
        seconds: 300,
      })),
      ...[1, 2, 3].map((seed) => ({
        task: 'M2',
        category: 'mirror',
        heldOut: true,
        seed,
        status: 'pass',
        costUsd: 0.2,
        seconds: 120,
      })),
      { task: 'K4', category: 'craft', seed: 1, status: 'unavailable' },
    ];
    const stats = suiteStats(results);

    expect(stats.tune).toMatchObject({ tasks: 2, gradedTasks: 1, meanPassRate: 0.667, costUsd: 1.5 });
    expect(stats.tune.passK[3]).toBe(0);
    expect(stats.heldOut).toMatchObject({ tasks: 1, meanPassRate: 1 });
    expect(statsMarkdown(stats)).toContain('| A1 | assembly |');
  });
});

describe('critique stubs', () => {
  it('loads stubs written by from-critique as tasks with a pending grader', async () => {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'micro-data-'));
    const dir = path.join(data, 'stubs', 'K5');

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'start.json'), JSON.stringify({ parts: [] }));
    fs.writeFileSync(
      path.join(dir, 'task.json'),
      JSON.stringify({
        id: 'K5',
        instruction: 'THe head shape is too basic',
        startScene: 'start.json',
        source: { chat: 'c', message: 2 },
      }),
    );

    const [stub] = stubTasks(data);

    expect(stub).toMatchObject({
      id: 'K5',
      instruction: 'THe head shape is too basic',
      startFile: path.join(dir, 'start.json'),
    });
    expect((await gradeTask(stub, { before: { parts: [] }, after: { parts: [] } })).status).toBe('unavailable');
  });
});
