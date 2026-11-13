import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { raiseRightArm } from '../src/cameras/operator/fixtures/raiseRightArm';
import type { PoseSample } from '../src/cameras/operator/poseFollow';
import { g1Humanoid } from './g1Fixture';
import { FAKE_CAMERA, openApp, partCount, shown, type App } from './harness';

type Joints = Record<string, { target: number; position: number }>;

interface OperatorCamera {
  open: boolean;
  live: boolean;
  ended: boolean;
  label: string | null;
}

interface StudioWindow {
  __studio: {
    load: (record: unknown) => void;
    simState: () => { drive: string; joints: Joints };
    feedPose: (samples: PoseSample[]) => void;
    operatorCamera: () => OperatorCamera;
  };
}

const G1 = g1Humanoid();
const OPERATOR_TILE = '[data-testid="camera-tile"][data-camera="operator"]';
const RAISED_DEG = -20;
const LEG_DRIFT_DEG = 2;
const LEG = /hip|knee|ankle/;

let app: App;

const studio = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState());

const operatorCamera = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.operatorCamera());

const shoulderPitch = async () => (await studio()).joints.right_shoulder_pitch_joint?.position ?? 0;

const legPositions = (joints: Joints) =>
  Object.fromEntries(Object.entries(joints).flatMap(([id, j]) => (LEG.test(id) ? [[id, j.position]] : [])));

async function command(label: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type(label);
  await app.page.locator(shown('button[data-idx="0"]'), { hasText: label }).waitFor();
  await app.page.keyboard.press('Enter');
}

beforeAll(async () => {
  app = await openApp({}, [], { args: FAKE_CAMERA });
  await app.page.evaluate((record) => (window as unknown as StudioWindow).__studio.load(record), G1);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(G1.parts.length), { timeout: 10000 });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Drive with Camera', () => {
  it('raises the G1’s right arm with the person’s, holds the legs and turns the camera off on Esc', async () => {
    const { page } = app;

    await page.evaluate((samples) => (window as unknown as StudioWindow).__studio.feedPose(samples), raiseRightArm());
    await command('Drive with Camera');
    await expect.poll(async () => (await studio()).drive, { timeout: 60000 }).toBe('on');
    await page.locator(shown(OPERATOR_TILE)).first().waitFor();
    expect(await operatorCamera()).toMatchObject({ open: true, live: true });
    await expect.poll(shoulderPitch, { timeout: 30000 }).toBeLessThan(RAISED_DEG);

    const legs = legPositions((await studio()).joints);

    expect(Object.keys(legs)).toHaveLength(12);

    for (const [id, position] of Object.entries(legs)) expect(Math.abs(position), id).toBeLessThan(LEG_DRIFT_DEG);

    await page.mouse.click(720, 450);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await studio()).drive).toBe('off');
    await expect.poll(() => page.locator(OPERATOR_TILE).count()).toBe(0);
    expect(await operatorCamera()).toMatchObject({ open: false, live: false, ended: true });
    expect(app.errors).toEqual([]);
  });
});
