import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type ScenePart } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

interface Timeline {
  frame: number;
  frames: number;
  dt: number;
  sought: number | null;
  playing: boolean;
  speed: number;
  loop: [number, number] | null;
}

interface SimState {
  stats: { time: number } | null;
  drive: string;
  activeCase: string | null;
  tries: unknown[];
  timeline: Timeline | null;
  joints: Record<string, { position: number }>;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  runCase: (id: string) => void;
  referenceTry: () => Promise<void>;
  caseRunState: () => { open: boolean; live: boolean; playback: boolean };
};

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const joint = arm.joints[0].id;

type Window = { __studio: Studio };

const simState = () => app.page.evaluate(() => (window as unknown as Window).__studio.simState());
const runState = () => app.page.evaluate(() => (window as unknown as Window).__studio.caseRunState());
const timeline = async () => (await simState()).timeline;

const panel = (id: string) => app.page.locator(shown(`[data-panel="${id}"]`));
const plot = () => panel('arms').getByTestId('plot');

function camera(): ScenePart {
  return {
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
}

function scene() {
  const last = arm.joints.at(-1)!;
  const kase = {
    ...presetCase('touch-the-dots', buildRig(arm.joints, arm.parts), arm.parts),
    id: 'playback',
    name: 'Touch the Dots',
    console: {
      input: ['keys'],
      panels: [
        { id: 'cams', kind: 'camera', signal: 'camera.*' },
        { id: 'angle', kind: 'value', signal: `joint.${joint}.position` },
        { id: 'arms', kind: 'plot', signals: ['joint.*.position'] },
        { id: 'map', kind: 'map' },
        { id: 'tries', kind: 'list', of: 'tries' },
      ],
      layout: {
        areas: [
          { size: 320, panels: ['cams'] },
          { canvas: true },
          { size: 328, panels: ['angle', 'arms', 'map', 'tries'] },
        ],
      },
    },
  };

  return {
    name: 'playback',
    parts: [...arm.parts, camera()],
    project: {
      ...DEFAULT_PROJECT,
      joints: arm.joints.map((j) => (j === last ? { ...j, child: [...j.child, 'cam'] } : j)),
      cases: [kase],
    },
  };
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('Playing a try through its console', () => {
  itUnlessWindows(
    'plays a chosen try through the panels on one timeline, then Esc returns them to live',
    async () => {
      const { page } = app;
      const record = scene();

      await page.evaluate((r) => (window as unknown as Window).__studio.load(r), record);
      await expect.poll(() => partCount(page)).toBe(record.parts.length);
      await page.evaluate(() => (window as unknown as Window).__studio.runCase('playback'));
      await expect.poll(async () => (await runState()).live).toBe(true);

      await page.evaluate(() => void (window as unknown as Window).__studio.referenceTry());
      await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');

      const started = (await simState()).stats?.time ?? 0;

      await expect
        .poll(async () => ((await simState()).stats?.time ?? 0) - started, { timeout: 60000 })
        .toBeGreaterThan(3);
      await panel('tries').locator('button', { hasText: 'Stop Try' }).first().click();
      await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
      expect(await plot().getAttribute('data-playhead')).toBeNull();

      await panel('tries').getByTestId('try-row').first().locator('button[aria-label="Replay"]').click();
      await expect.poll(async () => (await runState()).playback, { timeout: 30000 }).toBe(true);
      await expect.poll(async () => (await timeline())?.sought, { timeout: 30000 }).not.toBeNull();
      await expect.poll(() => panel('cams').getByTestId('camera-tile').count()).toBeGreaterThan(0);

      const { frames, dt } = (await timeline())!;
      const box = (await plot().boundingBox())!;

      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      const half = Math.round((frames - 1) / 2);

      await expect.poll(async () => (await timeline())?.sought).toBeGreaterThanOrEqual(half - 2);
      expect((await timeline())!.sought).toBeLessThanOrEqual(half + 2);
      await expect
        .poll(async () => Number(await plot().getAttribute('data-playhead')))
        .toBeCloseTo((await timeline())!.sought! * dt, 1);
      await expect
        .poll(async () => {
          const shownValue = Number.parseFloat((await panel('angle').locator('[data-signal]').textContent()) ?? '');
          const position = (await simState()).joints[joint]?.position ?? Number.NaN;

          return Math.abs(shownValue - position);
        })
        .toBeLessThan(0.02);
      expect(Number(await panel('map').getByTestId('map').getAttribute('data-path'))).toBeGreaterThan(10);

      const at = (await timeline())!.frame;

      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await timeline())?.frame).toBe(at + 1);
      await page.keyboard.press(']');
      await expect.poll(async () => (await timeline())?.speed).toBe(2);
      await page.keyboard.press('Space');
      await expect.poll(async () => (await timeline())?.playing).toBe(true);
      await page.keyboard.press('Space');
      await expect.poll(async () => (await timeline())?.playing).toBe(false);

      const lane = (await page.getByTestId('timeline-lane').first().locator('svg').first().boundingBox())!;

      await page.keyboard.down('Shift');
      await page.mouse.move(lane.x + lane.width * 0.2, lane.y + lane.height / 2);
      await page.mouse.down();
      await page.mouse.move(lane.x + lane.width * 0.6, lane.y + lane.height / 2, { steps: 4 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await expect.poll(async () => (await timeline())?.loop?.[1] ?? 0).toBeGreaterThan(frames * 0.5);

      await page.keyboard.press('Escape');
      await expect.poll(async () => (await runState()).playback).toBe(false);
      expect((await runState()).live).toBe(true);
      await expect.poll(() => plot().getAttribute('data-playhead')).toBeNull();
      expect(await page.getByTestId('try-timeline').count()).toBe(0);

      await page.keyboard.press('Escape');
      await expect.poll(async () => (await runState()).open).toBe(false);
      expect(app.errors).toEqual([]);
    },
    240000,
  );
});
