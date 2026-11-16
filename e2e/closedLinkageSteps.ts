import { expect } from 'vitest';
import type { ScenePart, ProjectSettings } from '../src/types/robotics';
import { couplerPoint, type PlacedFourBar, type Vec2 } from '../src/utils/linkage';
import { shown, type App } from './harness';

interface Studio {
  sketchPath: (points: Vec2[]) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  load: (record: unknown) => void;
  simState: () => { playing: boolean; status: string; joints: Record<string, { position: number }> };
  simPins: () => Record<string, number[]>;
  recordSimulation: (on: boolean) => Promise<number[] | null>;
  replaySimulation: (bytes: number[], frame: number) => Promise<number | undefined>;
  simRecordingFrame: () => number | undefined;
}

type StudioWindow = { __studio: Studio };

export async function command(app: App, name: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type(name);
  await app.page.keyboard.press('Enter');
}

export const state = (app: App) => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState());
export const pins = (app: App) => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simPins());

export async function insertClosedLinkage(app: App) {
  const linkage: PlacedFourBar = {
    origin: [-40, 10],
    angle: 10,
    ground: 40,
    crank: 20,
    coupler: 50,
    rocker: 50,
    point: [80, 20],
  };
  const path = Array.from({ length: 7 }, (_, i) => couplerPoint(linkage, 30 + i * 35)!);

  await command(app, 'Sketch');
  await app.page.locator(shown('[role="tab"]'), { hasText: /^Path$/ }).click();
  await app.page.evaluate((points) => (window as unknown as StudioWindow).__studio.sketchPath(points), path);
  await app.page
    .locator(shown('button'), { hasText: /^\d+(\.\d+)? mm$/ })
    .first()
    .click();
  await expect
    .poll(async () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.sceneRecord().parts.length))
    .toBe(5);

  return app.page.evaluate(() => {
    const studio = (window as unknown as StudioWindow).__studio;
    const scene = studio.sceneRecord();
    const crank = scene.project.joints!.find((j) => j.type === 'revolute')!;
    const animation = {
      id: 'crank-sweep',
      name: 'Crank sweep',
      duration: 2,
      loop: true,
      interpolation: 'linear',
      keyframes: [
        { t: 0, values: { [crank.id]: 0 } },
        { t: 1, values: { [crank.id]: 20 } },
        { t: 2, values: { [crank.id]: 0 } },
      ],
    };

    studio.load({ ...scene, project: { ...scene.project, animations: [animation] } });

    return {
      crank: crank.id,
      coupler: scene.parts.find((p) => p.name === 'Coupler')!.id,
      rocker: scene.parts.find((p) => p.name === 'Rocker')!.id,
    };
  });
}

export async function runClosedLinkage(app: App, joints: { crank: string; coupler: string; rocker: string }) {
  await command(app, 'Show Simulate');
  await app.page.getByRole('button', { name: 'Simulate', exact: true }).click();
  await expect.poll(async () => (await state(app)).playing).toBe(true);
  await app.page.evaluate(() => (window as unknown as StudioWindow).__studio.recordSimulation(true));
  await app.page.locator(shown('select[aria-label="Controller"]')).selectOption({ label: 'Crank sweep' });
  await expect.poll(async () => (await state(app)).joints[joints.crank]?.position ?? 0).toBeGreaterThan(5);
  await expect
    .poll(async () =>
      Math.abs((await state(app)).joints[joints.coupler.replace('coupler', 'coupler-joint')]?.position ?? 0),
    )
    .toBeGreaterThan(1);

  await expect
    .poll(async () =>
      Math.abs((await state(app)).joints[joints.rocker.replace('rocker', 'rocker-joint')]?.position ?? 0),
    )
    .toBeGreaterThan(1);

  const at = await pins(app);

  expect(Math.hypot(...at[joints.coupler].map((v, i) => v - at[joints.rocker][i]))).toBeLessThan(0.2);

  return app.page.evaluate(() => (window as unknown as StudioWindow).__studio.recordSimulation(false));
}

export async function reopenClosedRecording(app: App, bytes: number[]) {
  await command(app, 'Stop Simulation');
  await app.page.getByRole('button', { name: 'Simulate', exact: true }).click();
  await expect.poll(async () => (await state(app)).status).toBe('ready');
  await app.page.evaluate((saved) => (window as unknown as StudioWindow).__studio.replaySimulation(saved, 0), bytes);
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simRecordingFrame()))
    .toBe(0);

  const first = await pins(app);

  const frame = await app.page.evaluate(
    (saved) => (window as unknown as StudioWindow).__studio.replaySimulation(saved, -1),
    bytes,
  );

  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simRecordingFrame()))
    .toBe(frame);
  await expect
    .poll(async () => {
      const last = await pins(app);

      return Math.max(...Object.keys(first).map((id) => Math.hypot(...first[id].map((v, i) => v - last[id][i]))));
    })
    .toBeGreaterThan(0.5);
}
