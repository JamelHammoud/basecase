import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type ScenePart } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

type Studio = {
  load: (r: unknown) => void;
  agentRequest: (kind: string, payload: Record<string, unknown>) => Promise<unknown>;
  simState: () => { activeCase: string | null };
};

const studio = () => (window as unknown as { __studio: Studio }).__studio;

const RECORDED_CREATE_CASE = {
  goal: 'touch',
  name: 'Wrist Camera Teleop',
  brief: 'Touch the point while watching the wrist camera.',
  console: {
    input: ['keys'],
    panels: [
      { id: 'wrist', kind: 'camera', signal: 'camera.wrist_camera' },
      { id: 'arm', kind: 'plot', title: 'Arm', signals: ['joint.*.position'], seconds: 10 },
      { id: 'tries', kind: 'list', of: 'tries' },
    ],
    layout: { areas: [{ size: 480, panels: ['wrist'] }, { canvas: true }, { size: 320, panels: ['arm', 'tries'] }] },
  },
};

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

const panelIds = () =>
  app.page
    .locator(shown('[data-testid="case-run-panel"]'))
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.panel));

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('A Case app from the agent', () => {
  it('opens a recorded create_case with a camera console running, laid out by its console', async () => {
    const { page } = app;
    const scene = armWithCamera();

    await page.evaluate((record) => studio().load(record), scene);
    await expect.poll(() => partCount(page)).toBe(scene.parts.length);

    const reply = await page.evaluate((payload) => studio().agentRequest('create_case', payload), RECORDED_CREATE_CASE);

    expect(reply).toMatchObject({ ok: true, id: 'wrist-camera-teleop', running: true });
    expect(await page.evaluate(() => studio().simState().activeCase)).toBe('wrist-camera-teleop');
    await expect.poll(panelIds).toEqual(['wrist', 'arm', 'tries']);
    await expect.poll(() => page.locator(shown('[data-panel="wrist"] [data-camera="wrist_camera"]')).count()).toBe(1);
    expect(await page.locator(shown('[data-testid="camera-strip"]')).count()).toBe(0);

    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator(shown('[data-testid="case-run-panel"]')).count()).toBe(0);
  });
});
