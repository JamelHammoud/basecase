import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { parseBvh } from '../src/utils/mocap';
import { waveBvh } from '../src/utils/mocap.fixtures';
import { clipOf } from '../src/utils/motionClip';
import { fitMotionSkeleton } from '../src/utils/motionSkeleton';
import { openApp, shown, type App } from './harness';

interface StudioHook {
  clear: () => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  dropFiles: (files: Array<{ name: string; base64: string }>) => void;
  bomLines: () => Array<{ key: string; qty: number }>;
}

type Studio = { __studio: StudioHook };

let app: App;

const record = () => app.page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());

function expectedJoints(): number {
  const fit = fitMotionSkeleton(clipOf(parseBvh(waveBvh(), 'Wave')), { heightMm: 300 });

  if (!('fit' in fit)) throw new Error(fit.problem);

  return fit.fit.skeleton.joints.length;
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Design From Motion', () => {
  it('fits a skeleton and its servos to a dropped BVH on an empty scene, and undoes them in one step', async () => {
    const joints = expectedJoints();

    await app.page.evaluate(() => (window as unknown as Studio).__studio.clear());
    await app.page.evaluate(
      (base64) => (window as unknown as Studio).__studio.dropFiles([{ name: 'Wave.bvh', base64 }]),
      Buffer.from(waveBvh()).toString('base64'),
    );

    const sheet = app.page.locator(shown('[role="dialog"][aria-label="Import Wave"]'));

    await sheet.getByLabel('Height').fill('300');
    await sheet.getByRole('button', { name: 'Design From Motion' }).click();
    await expect.poll(async () => (await record()).project.skeleton?.joints.length ?? 0).toBe(joints);
    await expect.poll(() => app.page.locator(shown('[data-skeleton-joint]')).count()).toBeGreaterThan(0);

    const { project, parts } = await record();
    const actuators = new Set(
      project.skeleton!.joints.map((j) => j.actuator!.split('|')[0].slice('component:'.length)),
    );
    const lines = await app.page.evaluate(() => (window as unknown as Studio).__studio.bomLines());
    const servos = lines.filter((l) => [...actuators].some((id) => l.key.includes(id)));

    expect(servos.reduce((n, l) => n + l.qty, 0)).toBe(joints);
    expect(parts.map((p) => p.frame).sort()).toEqual(project.skeleton!.joints.map((j) => j.id).sort());

    await app.page.keyboard.press('Meta+z');

    await expect.poll(async () => (await record()).project.skeleton).toBeUndefined();
    await expect.poll(async () => (await record()).parts.length).toBe(0);
  }, 90000);
});
