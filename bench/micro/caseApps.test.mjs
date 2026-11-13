import { describe, expect, it } from 'vitest';
import { ARC_CONSOLES } from '../../src/cases/console/fixtures/arcConsoles';
import { gradeTask } from './grade.mjs';
import { CASE_APP_TASKS } from './tasks/caseApps.mjs';

const load = (file) => import(/* @vite-ignore */ `../..${file}`);
const task = (id) => CASE_APP_TASKS.find((t) => t.id === id);
const BUILT = new Set(['keys', 'gamepad']);
const adapters = { inputBuilt: async (id) => BUILT.has(id) };

const fitApp = (rows) => ({
  call: async (kind, { id }) => (kind === 'check_case_fit' && id ? { ok: true, rows } : null),
});
const FITS = [
  { id: 'slot', label: 'Fits this Case', state: 'pass', detail: 'Yes' },
  { id: 'compile', label: 'Compiles', state: 'pass', detail: '6 joints' },
  { id: 'settle', label: 'Settles', state: 'pass', detail: 'Stays up' },
];

const withCase = (scene, console) => ({
  ...scene,
  project: { ...scene.project, cases: [{ id: 'app', name: 'App', ...(console ? { console } : {}) }] },
});

const keysConsole = (panels) => ({
  input: ['keys'],
  panels,
  layout: { areas: [{ canvas: true }, { size: 300, panels: panels.map((p) => p.id) }] },
});

describe('Case-app micro-evals', () => {
  it('are the twelve experiences of arc #184, a third held out', () => {
    expect(CASE_APP_TASKS.map((t) => t.id)).toEqual(Array.from({ length: 12 }, (_, i) => `E${i + 1}`));
    expect(CASE_APP_TASKS.filter((t) => t.heldOut)).toHaveLength(4);
  });

  it('never passes a start scene', async () => {
    for (const t of CASE_APP_TASKS) {
      const start = await t.record(load);
      const graded = await gradeTask(t, { before: start, after: start, adapters });

      expect([t.id, graded.status]).toEqual([t.id, 'fail']);
    }
  }, 30000);

  it('passes the block game on four counts when the agent builds its console', async () => {
    const start = await task('E11').record(load);
    const game = ARC_CONSOLES.find((c) => c.name === 'Block game').console;
    const graded = await gradeTask(task('E11'), {
      before: start,
      after: withCase(start, game),
      app: fitApp(FITS),
      adapters,
    });

    expect(graded.checks.map((c) => c.pass)).toEqual([true, true, true, true]);
    expect(graded.status).toBe('pass');
  });

  it('scores an input this version lacks as named, not built, instead of passing or failing it', async () => {
    const start = await task('E1').record(load);
    const g1 = { ...start, parts: [{ id: 'pelvis', group: { id: 'g1', name: 'Unitree G1' } }] };
    const after = withCase(
      { ...g1, project: { ...g1.project, joints: [{ id: 'left_shoulder' }] } },
      keysConsole([{ id: 'eye', kind: 'list', of: 'tries' }]),
    );
    const graded = await gradeTask(task('E1'), { before: start, after, app: fitApp(FITS), adapters });

    expect(graded.checks[1]).toMatchObject({
      pass: null,
      detail: 'Named, not built: camera, the operator camera',
      notBuilt: ['camera', 'the operator camera'],
    });
    expect(graded.status).toBe('unavailable');
  });

  it('fails a built input left out, a refused slot and a sim that falls', async () => {
    const start = await task('E3').record(load);
    const after = withCase(start, keysConsole([{ id: 'front', kind: 'camera', signal: 'camera.front_camera' }]));
    const graded = await gradeTask(task('E3'), {
      before: start,
      after,
      app: fitApp([
        { id: 'slot', label: 'Fits this Case', state: 'fail', detail: 'No' },
        { id: 'compile', label: 'Compiles', state: 'pass', detail: '3 joints' },
        { id: 'settle', label: 'Settles', state: 'fail', detail: 'Fell at 0.4 s' },
      ]),
      adapters,
    });

    expect(graded.checks.map((c) => [c.pass, c.detail])).toEqual([
      [true, 'Yes'],
      [false, 'Missing: gamepad'],
      [false, 'No'],
      [false, 'Settles: Fell at 0.4 s'],
    ]);
  });

  it('leaves fit and the sim unavailable without the app', async () => {
    const start = await task('E11').record(load);
    const graded = await gradeTask(task('E11'), { before: start, after: withCase(start, null), adapters });

    expect(graded.checks.map((c) => c.pass)).toEqual([true, false, null, null]);
  });
});
