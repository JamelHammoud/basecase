import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { waveBvh } from '../src/utils/mocap.fixtures';
import { openApp, shown, type App } from './harness';

interface StudioHook {
  load: (record: { parts: ScenePart[]; project: ProjectSettings }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  dropFiles: (files: Array<{ name: string; base64: string }>) => void;
  pickFiles: (files: Array<{ name: string; base64: string }>) => void;
  skeletonEditing: () => boolean;
  bomLines: () => Array<{ key: string; qty: number }>;
}

type Studio = { __studio: StudioHook };

const WAVE = [{ name: 'wave.bvh', base64: Buffer.from(waveBvh()).toString('base64') }];

let app: App;

const record = () => app.page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());

const sheet = () => app.page.locator(shown('[role="dialog"][aria-label="Import wave"]'));

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Design From Motion', () => {
  it('fits a skeleton and its servos to a dropped clip on an empty scene, and undoes them in one step', async () => {
    const { project } = await record();

    await app.page.evaluate((scene) => (window as unknown as Studio).__studio.load(scene), { parts: [], project });
    await app.page.evaluate((files) => (window as unknown as Studio).__studio.dropFiles(files), WAVE);
    await expect.poll(() => sheet().isVisible()).toBe(true);
    await sheet().getByLabel('Height').fill('300');
    await sheet().getByLabel('Height').press('Enter');
    await sheet().getByRole('button', { name: 'Design From Motion' }).click();
    await expect.poll(async () => (await record()).project.skeleton?.joints.length ?? 0).toBe(2);

    const skeleton = (await record()).project.skeleton!;
    const lines = await app.page.evaluate(() => (window as unknown as Studio).__studio.bomLines());
    const keys = new Set(skeleton.joints.map((j) => j.actuator));

    expect(skeleton.joints.map((j) => j.id)).toEqual(['right_shoulder_roll', 'right_elbow_roll']);
    expect(lines.filter((l) => keys.has(l.key)).reduce((n, l) => n + l.qty, 0)).toBe(skeleton.joints.length);
    expect(await app.page.evaluate(() => (window as unknown as Studio).__studio.skeletonEditing())).toBe(true);
    await expect.poll(() => sheet().isVisible()).toBe(false);

    await app.page.keyboard.press('Meta+z');

    await expect.poll(async () => (await record()).project.skeleton).toBeUndefined();
    await expect.poll(async () => (await record()).parts).toEqual([]);
  }, 90000);

  it('opens the same sheet from ⌘K', async () => {
    await app.page.evaluate((files) => (window as unknown as Studio).__studio.pickFiles(files), WAVE);
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Design From Motion');
    await app.page.keyboard.press('Enter');

    await expect.poll(() => sheet().isVisible()).toBe(true);
    await app.page.keyboard.press('Escape');
    await expect.poll(() => sheet().isVisible()).toBe(false);
  }, 60000);
});
