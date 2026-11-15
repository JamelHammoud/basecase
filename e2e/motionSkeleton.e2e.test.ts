import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../src/types/robotics';
import { waveBvh } from '../src/utils/motionSkeleton.fixtures';
import { humanoid, walkBvh } from '../src/utils/mocap.fixtures';
import { openApp, shown, type App } from './harness';

interface StudioHook {
  load: (record: { parts: ScenePart[]; project: ProjectSettings }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  dropFiles: (files: Array<{ name: string; base64: string }>) => void;
  bomLines: () => Array<{ key: string; qty: number }>;
}

type Studio = { __studio: StudioHook };

let app: App;

const record = () => app.page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Design From Motion', () => {
  it('opens the BVH picker from the command and keeps a malformed clip out of the scene', async () => {
    await app.page.evaluate((scene) => (window as unknown as Studio).__studio.load(scene), {
      parts: [],
      project: DEFAULT_PROJECT,
    });
    await expect.poll(async () => (await record()).parts.length).toBe(0);
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Design From Motion');

    const chooser = app.page.waitForEvent('filechooser');

    await app.page.keyboard.press('Enter');
    await (await chooser).setFiles({ name: 'Broken.bvh', mimeType: 'text/plain', buffer: Buffer.from('broken') });

    const sheet = app.page.locator(shown('[role="dialog"][aria-label="Design From Motion"]'));

    await expect.poll(() => sheet.count()).toBe(1);
    await sheet.getByRole('button', { name: 'Design Skeleton', exact: true }).click();
    await expect.poll(() => sheet.locator('p.text-red-400').count()).toBe(1);
    expect((await record()).project.skeleton).toBeUndefined();
    expect((await record()).parts).toEqual([]);
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect.poll(() => sheet.count()).toBe(0);
  });

  it('turns a dropped wave into an editable skeleton with servos and undoes the whole design', async () => {
    await app.page.evaluate((scene) => (window as unknown as Studio).__studio.load(scene), {
      parts: [],
      project: DEFAULT_PROJECT,
    });
    await expect.poll(async () => (await record()).parts.length).toBe(0);
    await app.page.evaluate(
      (files) => (window as unknown as Studio).__studio.dropFiles(files),
      [{ name: 'Wave.bvh', base64: Buffer.from(waveBvh()).toString('base64') }],
    );

    const sheet = app.page.locator(shown('[role="dialog"][aria-label="Design From Motion"]'));

    await expect.poll(() => sheet.count()).toBe(1);
    expect(await sheet.getByLabel('Height').inputValue()).toBe('300');
    await sheet.getByRole('button', { name: 'Design Skeleton', exact: true }).click();
    await expect.poll(async () => (await record()).project.skeleton?.joints.length ?? 0).toBe(3);

    const { parts, project } = await record();
    const joints = project.skeleton!.joints;
    const lines = await app.page.evaluate(() => (window as unknown as Studio).__studio.bomLines());
    const servos = lines.filter((line) => joints.some((joint) => joint.actuator === line.key));
    const editing = app.page.locator(shown('[role="switch"][aria-label="Edit Skeleton"]'));

    expect(servos.reduce((sum, line) => sum + line.qty, 0)).toBe(joints.length);
    expect(parts).toHaveLength(joints.length);
    await expect.poll(() => editing.getAttribute('aria-checked')).toBe('true');
    expect(await app.page.locator(shown('[data-skeleton-joint]')).count()).toBe(joints.length);

    await app.page.keyboard.press('Meta+z');
    await expect.poll(async () => (await record()).project.skeleton).toBeUndefined();
    await expect.poll(async () => (await record()).parts.length).toBe(0);
    expect(app.errors).toEqual([]);
  });

  it('keeps BVH drops on an existing robot in the retarget sheet', async () => {
    const { parts, joints } = humanoid();

    await app.page.evaluate((scene) => (window as unknown as Studio).__studio.load(scene), {
      parts,
      project: { ...DEFAULT_PROJECT, joints },
    });
    await expect.poll(async () => (await record()).parts.length).toBe(parts.length);
    await app.page.evaluate(
      (files) => (window as unknown as Studio).__studio.dropFiles(files),
      [{ name: 'Walk.bvh', base64: Buffer.from(walkBvh()).toString('base64') }],
    );

    const sheet = app.page.locator(shown('[role="dialog"][aria-label="Import Walk"]'));

    await expect.poll(() => sheet.count()).toBe(1);
    expect(await app.page.locator(shown('[role="dialog"][aria-label="Design From Motion"]')).count()).toBe(0);
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await record()).project.skeleton).toBeUndefined();
    expect((await record()).parts).toHaveLength(parts.length);
    expect(app.errors).toEqual([]);
  });
});
