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

interface Tabs {
  list: () => { ids: string[]; activeId: string };
  open: () => void;
  select: (id: string) => void;
}

const BLANK_TILE = 0x1a;

const tabs = () => app.page.evaluate(() => (window as unknown as { __studioTabs: Tabs }).__studioTabs.list());

async function paintedShare(png: Buffer) {
  return app.page.evaluate(
    async ({ base64, blank }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const c2d = canvas.getContext('2d')!;

      c2d.drawImage(bitmap, 0, 0);

      const top = Math.floor(bitmap.height / 2);
      const { data } = c2d.getImageData(0, top, bitmap.width, bitmap.height - top);
      let painted = 0;

      for (let i = 0; i < data.length; i += 4) {
        if (Math.max(...[0, 1, 2].map((k) => Math.abs(data[i + k] - blank))) > 8) painted++;
      }

      return painted / (data.length / 4);
    },
    { base64: png.toString('base64'), blank: BLANK_TILE },
  );
}

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());
const camera = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.operatorCamera());
const position = async (id: string) => (await simState()).positions[id] ?? 0;

beforeAll(async () => {
  app = await openApp({}, [], FAKE_CAMERA_ARGS);

  const first = (await tabs()).activeId;

  await app.page.evaluate(() => (window as unknown as { __studioTabs: Tabs }).__studioTabs.open());
  await expect.poll(async () => (await tabs()).activeId).not.toBe(first);
  await app.page.evaluate((id) => (window as unknown as { __studioTabs: Tabs }).__studioTabs.select(id), first);
  await expect.poll(async () => (await tabs()).activeId).toBe(first);
  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), G1);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(G1.parts.length), { timeout: 10000 });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Drive With Camera', () => {
  it('opens the camera from ⌘K with a second tab open, paints the tile in view and drives the arms', async () => {
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Drive With Camera');
    await app.page.keyboard.press('Enter');

    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    expect((await simState()).driveClass).toBe('pose');

    const tile = app.page.locator(shown('[data-testid="camera-tile"][data-camera="operator"]'));

    await expect.poll(() => tile.count()).toBe(1);
    expect(await app.page.locator('[data-camera="operator"]').count()).toBe(1);
    await expect.poll(async () => paintedShare(await tile.screenshot()), { timeout: 20000 }).toBeGreaterThan(0.5);

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
