import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARC_CONSOLES } from '../src/cases/console/fixtures/arcConsoles';
import { presetCase } from '../src/cases/caseBuilder';
import { buildRig } from '../src/utils/kinematics';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type ScenePart } from '../src/types/robotics';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  activeCase: string | null;
  caseSeconds: number | null;
  tries: Array<{ passed: boolean; seconds: number }>;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  parts: () => ScenePart[];
  attachRobot: (link: unknown) => void;
  sceneRecord: () => { project: { cases?: Array<{ id: string; console?: { layout: { areas: unknown[] } } }> } };
};

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const sceneParts = () =>
  app.page.evaluate(() => JSON.stringify((window as unknown as { __studio: Studio }).__studio.parts()));

const panel = (id: string) => app.page.locator(shown(`[data-panel="${id}"]`));

const panelIds = () =>
  app.page
    .locator(shown('[data-testid="case-run-panel"]'))
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.panel));

const areaCount = () => app.page.locator(shown('[data-testid="case-run-area"]')).count();

const canvas = () => app.page.locator(shown('main:has(canvas)')).first();
const menuCount = () => app.page.locator(shown('[role=menu]')).count();
const nextFrame = () => app.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));

async function runCase() {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Run Case');
  await app.page.keyboard.press('Enter');
}

const inPanel = (id: string, name: string | RegExp) => panel(id).locator('button', { hasText: name }).first();

function armWithCamera() {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const last = robot.joints.at(-1)!;
  const camera: ScenePart = {
    id: 'cam',
    name: 'Wrist Camera',
    kind: 'component',
    category: 'perception',
    role: 'solid',
    componentId: 'raspberry-pi-camera-3',
    position: [0, 240, 20],
    rotation: [0, 0, 0],
    dimensions: { width: 25, height: 12, depth: 24 },
    color: '#333333',
    note: '',
    visible: true,
    locked: false,
  };

  return {
    name: 'arm-with-camera',
    parts: [...robot.parts, camera],
    project: {
      ...DEFAULT_PROJECT,
      joints: robot.joints.map((j) => (j === last ? { ...j, child: [...j.child, camera.id] } : j)),
    },
  };
}

async function runBlockGame() {
  const { page } = app;
  const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const game = ARC_CONSOLES.find((c) => c.name === 'Block game')!.console;
  const kase = {
    ...presetCase('touch-the-dots', buildRig(arm.joints, arm.parts), arm.parts),
    id: 'block-game',
    name: 'Knock the Dots',
    console: game,
  };
  const scene = {
    name: 'block-game',
    parts: arm.parts,
    project: { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] },
  };

  await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
  await expect.poll(() => partCount(page)).toBe(arm.parts.length);
  await openPlayTab(page, 'Cases');
  await page.locator(shown('[data-testid="cases-panel"] button'), { hasText: 'Knock the Dots' }).first().click();
  await expect.poll(async () => (await simState()).activeCase).toBe('block-game');

  await runCase();
  await expect.poll(panelIds).toEqual(['clock', 'score', 'go', 'reset', 'tries']);
}

const savedAreas = () =>
  app.page.evaluate(
    () =>
      (window as unknown as { __studio: Studio }).__studio
        .sceneRecord()
        .project.cases?.find((c) => c.id === 'block-game')?.console?.layout.areas,
  );

const menuItem = (name: string) => app.page.locator(shown('[role=menuitem]'), { hasText: name }).first();

async function dragBy(from: { x: number; y: number }, to: { x: number; y: number }) {
  await app.page.mouse.move(from.x, from.y);
  await app.page.mouse.down();
  await app.page.mouse.move(to.x, to.y, { steps: 12 });
  await app.page.mouse.up();
}

const middle = (box: { x: number; y: number; width: number; height: number } | null) => ({
  x: box!.x + box!.width / 2,
  y: box!.y + box!.height / 2,
});

beforeAll(async () => {
  app = await openApp();
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Run Case', () => {
  it('runs a Case without a console in the default layout: cameras, brief, servos and tries, then Esc returns', async () => {
    const { page } = app;
    const scene = armWithCamera();

    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
    await expect.poll(() => partCount(page)).toBe(scene.parts.length);

    await openPlayTab(page, 'Cases');
    await page.locator(shown('button'), { hasText: 'New Case' }).first().click();
    await page.locator(shown('[data-testid="new-case"] button'), { hasText: 'Make Case' }).click();
    await expect.poll(async () => (await simState()).activeCase).toMatch(/^touch-a-point/);

    const partsBefore = await sceneParts();

    await canvas().click({ button: 'right' });
    await expect.poll(menuCount).toBe(1);
    await page.keyboard.press('Escape');
    await expect.poll(menuCount).toBe(0);

    await runCase();

    await expect.poll(panelIds).toEqual(['cameras', 'brief', 'servos', 'tries']);
    expect(await page.locator('[data-panel="failures"]').evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
    expect(await areaCount()).toBe(2);
    await expect.poll(() => panel('cameras').locator('[data-testid="camera-tile"]').count()).toBe(2);
    expect(await page.locator('[data-camera="wrist_camera"]').count()).toBe(1);
    expect(await page.locator(shown('[data-testid="camera-strip"]')).count()).toBe(0);

    await canvas().click({ button: 'right' });
    await nextFrame();
    expect(await menuCount()).toBe(0);

    await page.evaluate(() => {
      const w = window as unknown as { __studio: Studio; __fakeRobotLink: unknown };

      w.__studio.attachRobot(w.__fakeRobotLink);
    });
    await inPanel('servos', 'Connect Emulated Robot').click();

    const measured = panel('servos').locator('[data-robot-joint]:not([data-position=""])');

    await expect.poll(() => measured.count(), { timeout: 30000 }).toBe(3);

    await inPanel('tries', 'Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    await inPanel('tries', 'Stop Try').click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);

    const ended = await simState();

    expect(ended.tries[0].seconds).toBeLessThan(ended.caseSeconds! - 1);

    await expect.poll(() => panel('tries').getByTestId('try-row').count()).toBe(1);

    const strip = panel('tries').getByTestId('try-row').locator('img');

    await expect.poll(() => strip.count()).toBe(1);
    await expect.poll(() => strip.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBe(288);
    await expect.poll(async () => (await simState()).drive).toBe('off');

    await page.keyboard.press('Escape');
    await expect.poll(areaCount).toBe(0);
    expect(await sceneParts()).toBe(partsBefore);
    expect(await page.locator(shown('[data-testid="camera-strip"]')).count()).toBe(1);

    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await expect.poll(() => page.locator(shown('[data-testid="case-brief"]')).count()).toBe(1);
    expect(await page.locator(shown('section')).allInnerTexts()).not.toContainEqual(
      expect.stringMatching(/^Emulated robot/),
    );
    expect(app.errors).toEqual([]);
  }, 180000);

  it('opens a Case’s own console: its areas, a live timer and score, Try It and Reset as buttons', async () => {
    const { page } = app;

    await runBlockGame();
    expect(await areaCount()).toBe(2);

    const [left, right] = await Promise.all([panel('clock').boundingBox(), panel('go').boundingBox()]);

    expect(left!.x + left!.width).toBeLessThan(right!.x);

    const clock = panel('clock').locator('[data-signal="clock"]');

    expect(await clock.textContent()).toBe('60.0 s');

    await inPanel('go', 'Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    await expect.poll(() => inPanel('reset', 'Reset').isDisabled()).toBe(true);
    await expect
      .poll(async () => Number.parseFloat((await clock.textContent()) ?? '60'), { timeout: 30000 })
      .toBeLessThan(59);
    expect(
      Number.parseFloat((await panel('score').locator('[data-signal="score"]').textContent()) ?? ''),
    ).toBeGreaterThan(0);

    await inPanel('tries', 'Stop Try').click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);

    const ended = await simState();

    expect(ended.tries[0].seconds).toBeLessThan(ended.caseSeconds! - 1);

    await inPanel('reset', 'Reset').click();
    await expect.poll(() => clock.textContent()).toBe('60.0 s');

    await page.keyboard.press('Escape');
    await expect.poll(areaCount).toBe(0);
    expect(app.errors).toEqual([]);
  }, 180000);
});

describe('Arranging a console', () => {
  it('arranges a running Case’s console by hand, during a try, and keeps it with the Case', async () => {
    const { page } = app;

    await runBlockGame();
    await inPanel('go', 'Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');

    const rightCard = await page.locator(shown('[data-area-card="2"]')).boundingBox();

    await dragBy(middle(await panel('clock').locator('header h3').boundingBox()), {
      x: rightCard!.x + rightCard!.width / 2,
      y: rightCard!.y + rightCard!.height - 40,
    });
    await expect.poll(panelIds).toEqual(['score', 'go', 'reset', 'tries', 'clock']);
    expect(await simState()).toMatchObject({ drive: 'on', tries: [] });

    await inPanel('tries', 'Stop Try').click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
    await expect.poll(async () => (await simState()).drive).toBe('off');

    const resizer = middle(
      await page.locator(shown('[data-testid="case-run-area"]')).last().locator('[role=separator]').boundingBox(),
    );

    await dragBy(resizer, { x: resizer.x - 100, y: resizer.y });
    await expect.poll(async () => ((await savedAreas())?.[2] as { size: number }).size).toBeGreaterThan(390);

    await page.keyboard.press('Meta+k');
    await page.keyboard.type('Add Panel');
    await page.keyboard.press('Enter');
    await menuItem('Value').click();
    await menuItem('time').click();
    await expect.poll(panelIds).toEqual(['score', 'go', 'reset', 'tries', 'clock', 'value']);

    await panel('score').click({ button: 'right' });
    await menuItem('Rename').click();
    await page.keyboard.type('Points');
    await page.keyboard.press('Enter');
    await expect.poll(() => panel('score').locator('header h3').textContent()).toBe('Points');

    await panel('reset').click({ button: 'right' });
    await menuItem('Delete').click();
    await page
      .getByRole('dialog', { name: 'Delete Reset?' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect.poll(panelIds).toEqual(['score', 'go', 'tries', 'clock', 'value']);
    await page.keyboard.press('Meta+z');
    await expect.poll(panelIds).toEqual(['score', 'go', 'reset', 'tries', 'clock', 'value']);

    await page.keyboard.press('Escape');
    await expect.poll(areaCount).toBe(0);
    await runCase();
    await expect.poll(panelIds).toEqual(['score', 'go', 'reset', 'tries', 'clock', 'value']);

    const areas = await savedAreas();

    expect(areas).toMatchObject([
      { size: 240, panels: ['score'] },
      { canvas: true },
      { panels: ['go', 'reset', 'tries', 'clock', 'value'] },
    ]);

    await page.keyboard.press('Escape');
    await expect.poll(areaCount).toBe(0);
    expect(app.errors).toEqual([]);
  }, 180000);
});
