import type { Page } from 'playwright-core';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import type { CaseConsole } from '../src/cases/console/format';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import type { VisionManifest } from '../src/vision/manifest';
import { scriptedDetectionOnnx, scriptedPixels } from '../src/vision/tracking/fixtures/scriptedOnnx';
import { START_MS, framesOf } from '../src/vision/tracking/fixtures/scripts';
import type { CameraRegions } from '../src/vision/tracking/types';
import { WORKFLOWS } from '../src/vision/tracking/fixtures/workflows';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';
import { visionManifest } from './visionFixtures';

let app: App;

interface Studio {
  load: (record: unknown) => void;
  simState: () => { activeCase: string | null; drive: string };
  loadVisionModel: (manifest: VisionManifest, bytes: number[]) => Promise<void>;
  feedVisionFrames: (camera: string, modelId: string, frames: { pixels: number[]; at: number }[]) => Promise<unknown>;
  caseRegions: () => Record<string, CameraRegions> | null;
}

const simState = (page: Page = app.page) =>
  page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const caseRegions = (page: Page = app.page) =>
  page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.caseRegions());

const conveyor = WORKFLOWS.find((workflow) => workflow.id === 'conveyor part counting')!;
const CAMERA = 'target_camera';

const consoleOf = (): CaseConsole => ({
  input: ['keys'],
  panels: [
    { id: 'view', kind: 'camera', signal: `camera.${CAMERA}` },
    { id: 'crossings', kind: 'value', title: 'Crossings', signal: `vision.${CAMERA}.line.line1.in` },
    { id: 'go', kind: 'button', action: 'try' },
    { id: 'tries', kind: 'list', of: 'tries' },
  ],
  layout: { areas: [{ size: 320, panels: ['view', 'crossings', 'go', 'tries'] }, { canvas: true }] },
});

function sceneOf(regions?: Record<string, CameraRegions>) {
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-3dof')!;
  const kase = {
    ...presetCase('touch-the-dots', buildRig(arm.joints, arm.parts), arm.parts),
    id: 'conveyor-count',
    name: 'Count Blocks',
    console: { ...consoleOf(), ...(regions ? { regions } : {}) },
  };

  return {
    name: 'conveyor-count',
    parts: arm.parts,
    project: {
      ...DEFAULT_PROJECT,
      joints: arm.joints,
      cases: [kase],
      cameras: [
        {
          id: 'target-camera',
          name: 'Target Camera',
          position: [0, 600, 500] as [number, number, number],
          target: [0, 0, 0] as [number, number, number],
          lens: { model: 'pinhole' as const, hfovDeg: 60 },
        },
      ],
    },
  };
}

async function openCase(regions?: Record<string, CameraRegions>) {
  const scene = sceneOf(regions);

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
  await expect.poll(() => partCount(app.page)).toBe(scene.parts.length);
  await openPlayTab(app.page, 'Cases');
  await app.page.locator(shown('[data-testid="cases-panel"] button'), { hasText: 'Count Blocks' }).first().click();
  await expect.poll(async () => (await simState()).activeCase).toBe('conveyor-count');
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Run Case');
  await app.page.keyboard.press('Enter');
}

const tile = () => app.page.locator(shown(`[data-testid="camera-tile"][data-camera="${CAMERA}"]`)).first();

beforeEach(async () => {
  app = await openApp();
}, 120000);

afterEach(async () => {
  await app?.close();
});

it('draws a line on a Case camera tile, keeps it with the Case and counts scripted crossings in the console', async () => {
  const { page } = app;
  const bytes = scriptedDetectionOnnx(conveyor);
  const manifest = visionManifest(bytes, 'block', 'scripted-conveyor');

  await openCase();
  await expect.poll(() => tile().count()).toBe(1);

  const box = (await tile().boundingBox())!;

  await tile().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Draw Line', exact: true }).click();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.9);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.1, { steps: 4 });
  await page.mouse.up();

  const line = tile().getByTestId('vision-line');

  await expect.poll(() => line.count()).toBe(1);
  expect(await line.getAttribute('data-name')).toBe('line1');

  const saved = await caseRegions();

  expect(saved?.[CAMERA].lines).toHaveLength(1);
  expect(saved?.[CAMERA].lines[0].from[1]).toBeGreaterThan(0.8);
  expect(saved?.[CAMERA].lines[0].to[1]).toBeLessThan(0.2);

  await page.locator(shown('[data-panel="go"] button'), { hasText: 'Try It' }).first().click();
  await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
  await page.evaluate(
    async ({ model, data }) => (window as unknown as { __studio: Studio }).__studio.loadVisionModel(model, data),
    { model: manifest, data: [...bytes] },
  );
  await page.evaluate(
    async ({ id, frames }) =>
      (window as unknown as { __studio: Studio }).__studio.feedVisionFrames('target_camera', id, frames),
    {
      id: manifest.id,
      frames: framesOf(conveyor).map((frame) => ({
        pixels: [...scriptedPixels(conveyor, frame).data],
        at: frame.timestamp - START_MS,
      })),
    },
  );

  const crossings = page.locator(shown('[data-panel="crossings"] [data-signal]'));

  await expect.poll(() => crossings.textContent(), { timeout: 30000 }).toMatch(/^4/);
  expect(await line.getAttribute('data-in')).toBe('4');
  expect(await line.getAttribute('data-out')).toBe('0');
  expect(app.errors).toEqual([]);
}, 180000);

it('reopens a saved Case with its zone and line drawn on the camera tile', async () => {
  const regions: Record<string, CameraRegions> = {
    [CAMERA]: {
      zones: [
        {
          name: 'bin',
          points: [
            [0.6, 0.5],
            [0.9, 0.5],
            [0.9, 0.9],
            [0.6, 0.9],
          ],
        },
      ],
      lines: [{ name: 'line1', from: [0.5, 1], to: [0.5, 0] }],
    },
  };

  await openCase(regions);
  await expect.poll(() => tile().getByTestId('vision-zone').count()).toBe(1);
  expect(await tile().getByTestId('vision-zone').getAttribute('data-name')).toBe('bin');
  expect(await tile().getByTestId('vision-line').getAttribute('data-name')).toBe('line1');
  expect(app.errors).toEqual([]);
}, 120000);
