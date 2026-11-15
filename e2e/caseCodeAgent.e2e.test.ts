import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

const rightTabs = () => app.page.locator(shown('[role="tablist"][aria-label="Inspector"] [role="tab"]'));

const composer = () => app.page.locator(shown('aside textarea')).last();

const sentPrompt = () =>
  (app.posts.find((p) => p.route === 'acp-prompt')?.body as { promptText?: string } | undefined)?.promptText;

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

const BROKEN_REVISION = { panel: 'remote', source: '<button>Sit</button>\n<script>\nconst = 1;\n</script>' };

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

async function openCase() {
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
  await expect.poll(() => panel('tries').count()).toBe(1);
}

beforeEach(async () => {
  app = await openApp();
}, 120000);

afterEach(async () => {
  await app?.close();
});

describe('the agent beside a running Case', () => {
  it('edits and undoes live panels, then sends the running Case context through ⌘I', async () => {
    await openCase();

    const first = await agentRequest('write_case_code', RECORDED_FIRST_WRITE);

    expect(first).toMatchObject({ ok: true, case: 'rover-remote', panel: 'remote', running: true, loaded: true });
    expect(first).toMatchObject({ errors: [], refused: [], logs: ['remote ready'] });
    await expect.poll(() => remote().getByRole('button', { name: 'Wave' }).count()).toBe(1);

    const broken = await agentRequest('write_case_code', BROKEN_REVISION);

    expect(broken).toMatchObject({ ok: true, loaded: false, errors: [{ line: 3 }] });
    await expect.poll(() => panel('remote').getByTestId('code-failed').count()).toBe(1);

    await app.page.keyboard.press('Meta+z');
    await expect.poll(() => panel('remote').getByTestId('code-failed').count()).toBe(0);
    await expect.poll(() => remote().getByRole('button', { name: 'Sit' }).count()).toBe(0);
    await expect.poll(() => remote().getByRole('button', { name: 'Wave' }).count()).toBe(1);
    expect(await simState()).toMatchObject({ activeCase: 'rover-remote', drive: 'off', tries: [] });

    await app.page.keyboard.press('Meta+i');
    await expect.poll(() => rightTabs().allTextContents()).toEqual(['Agent']);
    await composer().fill('Add a Sit button');
    await app.page.keyboard.press('Enter');
    await expect.poll(() => sentPrompt()).toContain('running the Case Rover Remote (rover-remote)');
    expect(await simState()).toMatchObject({ activeCase: 'rover-remote', drive: 'off', tries: [] });
  });
});
