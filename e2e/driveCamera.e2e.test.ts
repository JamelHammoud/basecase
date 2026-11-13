import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fixture from '../src/cameras/operator/fixtures/raiseRightArm.json';
import { FAKE_CAMERA_ARGS, openApp, partCount, shown, type App } from './harness';
import { g1Humanoid } from './g1Fixture';

let app: App;

const G1 = g1Humanoid();

interface CameraState {
  on: boolean;
  tracks: Array<{ kind: string; label: string; state: string }>;
  commands: number;
}

interface DriveState {
  status: string;
  drive: string;
  driveClass: string | null;
  positions: Record<string, number>;
  bodies: unknown[];
}

type Studio = {
  load: (record: unknown) => void;
  simState: () => DriveState;
  operatorCamera: () => CameraState;
  feedLandmarks: (frames: unknown, fps: number) => void;
};

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());
const camera = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.operatorCamera());
const position = async (id: string) => (await simState()).positions[id] ?? 0;

beforeAll(async () => {
  app = await openApp({}, [], FAKE_CAMERA_ARGS);
  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), G1);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(G1.parts.length), { timeout: 10000 });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Drive With Camera', () => {
  it('opens the camera from ⌘K, shows it beside the robot’s cameras and drives the arms', async () => {
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Drive With Camera');
    await app.page.keyboard.press('Enter');

    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    expect((await simState()).driveClass).toBe('pose');

    const tile = app.page.locator(shown('[data-testid="camera-tile"][data-camera="operator"]'));

    await expect.poll(() => tile.count()).toBe(1);

    const { tracks } = await camera();

    expect(tracks.map((t) => [t.kind, t.state])).toEqual([['video', 'live']]);
    await expect.poll(() => tile.textContent()).toBe(tracks[0].label);

    const knee = await position('left_knee_joint');
    const shoulder = await position('right_shoulder_pitch_joint');

    await app.page.evaluate(
      (frames) => (window as unknown as { __studio: Studio }).__studio.feedLandmarks(frames, 30),
      fixture.frames,
    );
    await expect.poll(() => position('right_shoulder_pitch_joint'), { timeout: 20000 }).toBeLessThan(shoulder - 45);
    expect((await camera()).commands).toBeGreaterThan(10);
    expect(Math.abs((await position('left_knee_joint')) - knee)).toBeLessThan(5);
  });

  it('stops driving and turns the camera off on Esc', async () => {
    await app.page.keyboard.press('Escape');

    await expect.poll(async () => (await simState()).drive).toBe('off');
    await expect.poll(async () => (await camera()).tracks.map((t) => t.state)).toEqual(['ended']);
    expect((await camera()).on).toBe(false);
    await expect.poll(() => app.page.locator(shown('[data-camera="operator"]')).count()).toBe(0);
  });
});
