import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gradeTask } from '../bench/micro/grade.mjs';
import { CASE_CODE_TASKS } from '../bench/micro/tasks/caseCode.mjs';
import { presetCase } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  activeCase: string | null;
  tries: unknown[];
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  agentRequest: (kind: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const agentRequest = (kind: string, payload: Record<string, unknown>) =>
  app.page.evaluate(([k, p]) => (window as unknown as { __studio: Studio }).__studio.agentRequest(k, p), [
    kind,
    payload,
  ] as const);

const panel = (id: string) => app.page.locator(shown(`[data-panel="${id}"]`));

const remote = () => app.page.frameLocator('[data-code-panel="remote"]');

const RECORDED_FIRST_WRITE = {
  panel: 'remote',
  title: 'Remote',
  place: { side: 'left', size: 280 },
  source: `<div style="display:grid;gap:var(--bc-gap);padding:var(--bc-inset)">
  <button data-move="wave">Wave</button>
</div>
<script>
document.querySelector('[data-move="wave"]').addEventListener('click', () => basecase.event('wave'));
console.log('remote ready');
</script>`,
};

const RECORDED_REVISION = {
  panel: 'remote',
  source: `<div style="display:grid;gap:var(--bc-gap);padding:var(--bc-inset)">
  <button data-move="wave">Wave</button>
  <button data-move="sit">Sit</button>
</div>
<script>
for (const button of document.querySelectorAll('button')) button.addEventListener('click', () => basecase.event(button.dataset.move));
</script>`,
};

const BROKEN_REVISION = { panel: 'remote', source: '<button>Wave</button>\n<script>\nconst = 1;\n</script>' };

function roverScene() {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const preset = presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts);
  const kase = {
    ...preset,
    id: 'rover-remote',
    name: 'Rover Remote',
    task: { ...preset.task, seconds: 120 },
    console: {
      input: ['keys'],
      panels: [{ id: 'tries', kind: 'list', of: 'tries' }],
      layout: { areas: [{ canvas: true }, { size: 300, panels: ['tries'] }] },
    },
  };

  return {
    name: 'rover-remote',
    parts: rover.parts,
    project: { ...DEFAULT_PROJECT, joints: rover.joints, cases: [kase] },
  };
}

const stillTrying = async () => {
  const state = await simState();

  return state.drive === 'on' && state.tries.length === 0;
};

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('the agent writing a running Case’s code', () => {
  it('reloads the panel it writes while the try keeps running, and ⌘Z walks its writes back', async () => {
    const { page } = app;
    const scene = roverScene();

    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
    await expect.poll(() => partCount(page)).toBe(scene.parts.length);
    await openPlayTab(page, 'Cases');
    await page.locator(shown('[data-testid="cases-panel"] button'), { hasText: 'Rover Remote' }).first().click();
    await expect.poll(async () => (await simState()).activeCase).toBe('rover-remote');
    await page.keyboard.press('Meta+k');
    await page.keyboard.type('Run Case');
    await page.keyboard.press('Enter');
    await panel('tries').locator('button', { hasText: 'Try It' }).first().click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');

    const first = await agentRequest('write_case_code', RECORDED_FIRST_WRITE);

    expect(first).toMatchObject({ ok: true, case: 'rover-remote', panel: 'remote', running: true, loaded: true });
    expect(first).toMatchObject({ errors: [], refused: [], logs: ['remote ready'] });
    await expect.poll(() => remote().getByRole('button', { name: 'Wave' }).count()).toBe(1);
    expect(await stillTrying()).toBe(true);

    const revised = await agentRequest('write_case_code', RECORDED_REVISION);

    expect(revised).toMatchObject({ ok: true, loaded: true, errors: [], refused: [] });
    await expect.poll(() => remote().getByRole('button', { name: 'Sit' }).count()).toBe(1);
    expect(await stillTrying()).toBe(true);

    const broken = await agentRequest('write_case_code', BROKEN_REVISION);

    expect(broken).toMatchObject({ ok: true, loaded: false, errors: [{ line: 3 }] });
    await expect.poll(() => panel('remote').getByTestId('code-failed').count()).toBe(1);

    await page.keyboard.press('Meta+z');
    await expect.poll(() => remote().getByRole('button', { name: 'Sit' }).count()).toBe(1);
    await page.keyboard.press('Meta+z');
    await expect.poll(() => remote().getByRole('button', { name: 'Sit' }).count()).toBe(0);
    await expect.poll(() => remote().getByRole('button', { name: 'Wave' }).count()).toBe(1);
    expect(await stillTrying()).toBe(true);
  }, 180000);

  it('grades a Case’s code in the app: the empty Case fails W6 and its reference remote passes', async () => {
    const { page } = app;
    const remoteTask = CASE_CODE_TASKS.find((t) => t.id === 'W6')!;
    const studio = (method: string, ...rest: unknown[]) =>
      page.evaluate(
        ([m, a]) =>
          (window as unknown as Record<string, Record<string, (...x: unknown[]) => unknown>>).__studio[m](...a),
        [method, rest] as const,
      );
    const graded = async (scene: { parts: unknown[] }) => {
      await studio('load', scene);
      await expect.poll(() => partCount(page)).toBe(scene.parts.length);

      return gradeTask(remoteTask, { before: scene, after: scene, app: { page, studio } });
    };

    expect((await graded(await remoteTask.startScene())).status).toBe('fail');

    const reference = await graded(await remoteTask.solutionScene());

    expect(reference.checks.map((c) => [c.pass, c.detail])).toEqual([
      [true, '1 panels ran'],
      [true, 'None refused'],
      [true, 'All found'],
      [true, 'Dance drove, Stop stopped'],
    ]);
  }, 180000);
});
