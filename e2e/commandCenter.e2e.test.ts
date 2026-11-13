import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type ScenePart } from '../src/types/robotics';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  activeCase: string | null;
  tries: Array<{ passed: boolean }>;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  parts: () => ScenePart[];
  attachRobot: (link: unknown) => void;
};

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const sceneParts = () =>
  app.page.evaluate(() => JSON.stringify((window as unknown as { __studio: Studio }).__studio.parts()));

const PANELS = ['command-center-cameras', 'command-center-goal', 'command-center-joints', 'command-center-tries'];

const panel = (id: string) => app.page.locator(shown(`[data-testid="${id}"]`));

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

beforeAll(async () => {
  app = await openApp();
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Command Center', () => {
  it('runs a Case from one window: cameras, goal, joints and tries, then Esc returns to the studio', async () => {
    const { page } = app;
    const scene = armWithCamera();

    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
    await expect.poll(() => partCount(page)).toBe(scene.parts.length);

    await openPlayTab(page, 'Cases');
    await page.locator(shown('button'), { hasText: 'New Case' }).first().click();
    await page.locator(shown('[data-testid="new-case"] button'), { hasText: 'Create' }).click();
    await expect.poll(async () => (await simState()).activeCase).toMatch(/^touch-a-point/);

    const partsBefore = await sceneParts();

    await page.keyboard.press('Meta+k');
    await page.keyboard.type('Open Command Center');
    await page.keyboard.press('Enter');

    for (const id of PANELS) await expect.poll(() => panel(id).count()).toBe(1);

    await expect.poll(() => panel('command-center-cameras').locator('[data-testid="camera-tile"]').count()).toBe(2);
    expect(await page.locator('[data-camera="wrist_camera"]').count()).toBe(1);
    expect(await page.locator(shown('[data-testid="camera-strip"]')).count()).toBe(1);

    await page.evaluate(() => {
      const w = window as unknown as { __studio: Studio; __fakeRobotLink: unknown };

      w.__studio.attachRobot(w.__fakeRobotLink);
    });
    await inPanel('command-center-joints', 'Connect Emulated Robot').click();

    const measured = panel('command-center-joints').locator('[data-robot-joint]:not([data-position=""])');

    await expect.poll(() => measured.count(), { timeout: 30000 }).toBe(3);
    expect(await panel('command-center-joints').getByTestId('robot-mode').getAttribute('data-mode')).toBe('look');

    await inPanel('command-center-tries', 'Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    await inPanel('command-center-tries', 'End Try')
      .click({ timeout: 2000 })
      .catch(() => undefined);
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
    await expect.poll(() => panel('command-center-tries').getByTestId('try-row').count()).toBe(1);
    await expect.poll(async () => (await simState()).drive).toBe('off');

    await page.keyboard.press('Escape');
    await expect.poll(() => page.getByTestId('command-center').count()).toBe(0);
    expect(await sceneParts()).toBe(partsBefore);
    expect(await page.locator(shown('[data-testid="camera-strip"]')).count()).toBe(1);

    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await expect.poll(() => page.locator(shown('[data-testid="case-brief"]')).count()).toBe(1);
    expect(await page.locator(shown('section')).allInnerTexts()).not.toContainEqual(
      expect.stringMatching(/^Emulated robot/),
    );
    expect(app.errors).toEqual([]);
  }, 180000);
});
