import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { specToPart } from '../../src/agent/agentScene';
import { buildCase, builderRobot } from '../../src/cases/caseBuilder';
import { buildRig } from '../../src/utils/kinematics';
import { parseBomTotal, parseCheckRows } from './adapters.mjs';
import { bomChange } from './caseChecks.mjs';
import { robotsIn } from './caseAppChecks.mjs';
import { gradeTask, startFacts } from './grade.mjs';
import { keepStartCases, recordFromFixture } from './materialize.mjs';
import { passHatK, suiteStats, statsMarkdown } from './stats.mjs';
import { ALL_TASKS, HARVESTED_TASKS, SEED_TASKS, selectTasks, stubTasks } from './tasks/index.mjs';

const build = (fixture) => recordFromFixture(fixture, specToPart, { buildCase, builderRobot, buildRig });
const APP_GRADED = new Set(['D1', ...SEED_TASKS.filter((t) => t.category === 'case-apps').map((t) => t.id)]);
const task = (id) => SEED_TASKS.find((t) => t.id === id);

describe('seed tasks', () => {
  it('covers the 43 seed tasks with a held-out third', () => {
    expect(SEED_TASKS).toHaveLength(43);
    expect(new Set(SEED_TASKS.map((t) => t.id)).size).toBe(43);
    expect(selectTasks({ split: 'heldout' })).toHaveLength(14);
    expect(selectTasks({ split: 'tune' }).some((t) => t.heldOut)).toBe(false);
  });

  it('keeps harvested tasks valid: unique ids, numbered H1 to Hn, each a planted fault', () => {
    expect(new Set(ALL_TASKS.map((t) => t.id)).size).toBe(ALL_TASKS.length);
    expect(selectTasks()).toHaveLength(ALL_TASKS.length);
    expect(HARVESTED_TASKS.map((t) => t.id)).toEqual(HARVESTED_TASKS.map((_, i) => `H${i + 1}`));
    expect(HARVESTED_TASKS.every((t) => t.fixture && t.solution && t.harvested)).toBe(true);
  });

  it('never passes a broken start scene, and passes every known fix', async () => {
    for (const t of ALL_TASKS.filter((x) => x.fixture)) {
      const start = await build(t.fixture());
      const atStart = await gradeTask(t, { before: start, after: start });

      expect([t.id, atStart.status]).not.toEqual([t.id, 'pass']);
      expect([t.id, atStart.status]).not.toEqual([t.id, 'error']);

      if (!t.solution && !t.solutionAnswer) continue;

      const fixed = t.solution ? keepStartCases(await build(t.solution()), start) : start;
      const graded = await gradeTask(t, { before: start, after: fixed, answer: t.solutionAnswer });

      expect([t.id, graded.status]).toEqual([t.id, APP_GRADED.has(t.id) ? 'unavailable' : 'pass']);
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

describe('the Case task', () => {
  const CASE_ID = 'reach-a-spot-past-a-block';
  const START_USD = 57.6;
  const ran = (passes) => ({
    data: {
      id: CASE_ID,
      name: 'Reach a Spot past a Block',
      runs: 20,
      passes,
      status: passes >= 18 ? 'pass' : 'fail',
      medianMargin: passes >= 18 ? 0.84 : -0.83,
      failures: passes < 20 ? [{ label: 'Missed', runs: 20 - passes }] : [],
      refusal: null,
      cached: false,
    },
  });
  const appWith = ({ run = ran(20), bomUsd = START_USD } = {}) => ({
    call: async (kind, payload) => {
      if (kind === 'bom') return { data: { estimatedUsd: bomUsd, budgetUsd: null, actuatorsUsd: 49.9 } };

      return kind === 'run_case' && payload.id === CASE_ID ? run : { error: `Unknown request "${kind}"` };
    },
  });

  async function graded({ after, run, bomUsd, startUsd = START_USD }) {
    const start = await build(task('D1').fixture());
    const facts = await startFacts(task('D1'), appWith({ bomUsd: startUsd }));

    return gradeTask(task('D1'), {
      before: start,
      after: after?.(start) ?? start,
      app: appWith({ run, bomUsd }),
      ...facts,
    });
  }

  it('builds the Case into the start scene and keeps it in the fix', async () => {
    const start = await build(task('D1').fixture());
    const fixed = keepStartCases(await build(task('D1').solution()), start);

    expect(start.project.cases.map((c) => [c.id, c.task.seconds])).toEqual([[CASE_ID, 8]]);
    expect(fixed.project.cases).toBe(start.project.cases);
  });

  it('fails the start on its Checks row and passes a fix within 20% of its BOM', async () => {
    expect((await graded({ run: ran(0) })).status).toBe('fail');
    expect((await graded({ run: ran(20), bomUsd: 59.9 })).status).toBe('pass');
    expect((await graded({ run: ran(17), bomUsd: 59.9 })).status).toBe('fail');
  });

  it('fails a fix that costs over 20% more, or edits the Case, or deletes it', async () => {
    const costly = await graded({ run: ran(20), bomUsd: 72.45 });
    const edited = await graded({
      after: (s) => ({
        ...s,
        project: { ...s.project, cases: s.project.cases.map((c) => ({ ...c, task: { ...c.task, seconds: 13 } })) },
      }),
    });
    const gone = await graded({
      after: (s) => ({ ...s, project: { ...s.project, cases: [] } }),
      run: { ok: false, problem: `No Case ${CASE_ID} in this scene.` },
    });

    expect(costly.checks.find((c) => /BOM/.test(c.name))).toMatchObject({
      pass: false,
      detail: '~$72.45 from ~$57.6 (+26%)',
    });
    expect(edited.checks.find((c) => /left as it was/.test(c.name))).toMatchObject({ pass: false, detail: 'Edited' });
    expect(gone.checks.map((c) => c.pass)).toEqual([false, false, true]);
  });

  it('is unavailable, never a pass, without the start BOM or run_case', async () => {
    const start = await build(task('D1').fixture());
    const noStartBom = await gradeTask(task('D1'), { before: start, after: start, app: appWith() });
    const noRunCase = await graded({ run: { error: 'Unknown request "run_case"' } });

    expect(noStartBom).toMatchObject({ status: 'unavailable', needs: ['bom'] });
    expect(noRunCase).toMatchObject({ status: 'unavailable', needs: ['runCase'] });
    expect(bomChange(50, 60)).toBeCloseTo(0.2);
    expect(bomChange(0, 60)).toBeNull();
    expect(bomChange(50, null)).toBeNull();
  });
});

describe('the Case app tasks', () => {
  const ran = (data) => ({ call: async (kind) => (kind === 'run_case' ? { data } : { error: kind }) });
  const RAN = { id: 'reach-a-spot', runs: 20, passes: 3, status: 'fail', failures: [], refusal: null };
  const rover = async () => build(task('E3').solution());
  const withConsole = (scene, patch) => ({
    ...scene,
    project: {
      ...scene.project,
      cases: scene.project.cases.map((c) => ({ ...c, console: { ...c.console, ...patch } })),
    },
  });

  it('scores the robot, the console, the fit and the run apart', async () => {
    const after = await rover();
    const grade = await gradeTask(task('E3'), { before: after, after, app: ran(RAN) });

    expect(grade.status).toBe('pass');
    expect(grade.checks.map((c) => c.pass)).toEqual([true, true, true, true]);
  });

  it('fails a console without the panel the sentence names, and a robot the Case refuses', async () => {
    const after = await rover();
    const blind = withConsole(after, {
      panels: [{ id: 'tries', kind: 'list', of: 'tries' }],
      layout: { areas: [{ canvas: true }, { size: 300, panels: ['tries'] }] },
    });
    const grade = await gradeTask(task('E3'), {
      before: after,
      after: blind,
      app: ran({ ...RAN, refusal: 'No wheels' }),
    });

    expect(grade.checks.map((c) => c.pass)).toEqual([true, false, false, false]);
    expect(grade.checks[1].detail).toBe('Lacks camera panel (has list)');
  });

  it('scores an input the app lacks as named, not built, instead of a pass or a fail', async () => {
    const after = withConsole(await rover(), { input: ['keys'] });
    const graded = (built) =>
      gradeTask({ ...task('E3'), grade: task('E1').grade }, { before: after, after, app: ran(RAN), adapters: built });

    expect((await graded({ inputBuilt: () => false })).checks[1]).toMatchObject({
      pass: null,
      detail: 'camera named, not built',
    });
    expect((await graded({ inputBuilt: () => true })).checks[1]).toMatchObject({ pass: false });
  });

  it('counts each joint chain as one robot', async () => {
    const one = await rover();
    const [a, b] = [one.project.joints, one.project.joints.map((j) => ({ ...j, parent: ['x'], child: ['y'] }))];

    expect(robotsIn(one)).toEqual([{ joints: 2, spinning: 2, names: ['Rover'], camera: false }]);
    expect(robotsIn({ ...one, project: { joints: [...a, b[0]] } })).toHaveLength(2);
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
