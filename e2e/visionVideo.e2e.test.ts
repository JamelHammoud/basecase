import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import type { VisionResult } from '../src/vision/protocol';
import { openApp, partCount, shown, type App } from './harness';
import { visionVideoDataset } from './visionVideoFixture';

let app: App;

type Studio = {
  load: (scene: unknown) => void;
  pickFiles: (files: { name: string; base64: string }[]) => void;
  visionTestModel: () => Promise<unknown>;
  visionState: () => { results: VisionResult[]; error: string | null };
};

const studio = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.visionState());
const tile = () => app.page.locator(shown('[data-testid="recorded-camera-tile"][data-camera="front"]'));

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.visionTestModel());
}, 120000);

afterAll(async () => {
  await app?.close();
});

async function importClip() {
  const robot = fixtureRobots().find((candidate) => candidate.id === 'arm-3dof')!;
  const files = visionVideoDataset(robot.joints.map((joint) => joint.id));
  const base64 = Buffer.from(zipSync(files)).toString('base64');

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: 'Recorded camera',
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await app.page.evaluate(
    (picked) => (window as unknown as { __studio: Studio }).__studio.pickFiles(picked),
    [{ name: 'camera-playhead.zip', base64 }],
  );
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.keyboard.type('Import');
  await app.page.locator(shown('button[data-idx]')).filter({ hasText: 'Import', hasNotText: 'Robot' }).click();
  await expect.poll(() => app.page.getByText('Imported 1 try', { exact: true }).count(), { timeout: 60000 }).toBe(1);
  await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();
  await app.page.locator(shown('[data-testid="try-tile"]')).filter({ hasText: 'camera-playhead.zip' }).click();
}

describe('recorded camera vision', () => {
  it('decodes the selected video frame and updates its detection overlay when the playhead moves', async () => {
    await importClip();
    await expect.poll(() => tile().count(), { timeout: 30000 }).toBe(1);
    await expect.poll(() => tile().getByTestId('vision-box').count()).toBe(1);
    expect(await tile().getByTestId('vision-box').getAttribute('data-label')).toBe('person');
    await expect
      .poll(async () => (await studio()).results.find((result) => result.camera === 'front')?.mediaTime)
      .toBe(0);

    await app.page.keyboard.press('End');
    await expect
      .poll(async () => (await studio()).results.find((result) => result.camera === 'front')?.mediaTime)
      .toBeGreaterThan(1);
    await expect.poll(() => tile().getByTestId('vision-box').count()).toBe(0);

    await app.page.keyboard.press('Home');
    await expect
      .poll(async () => (await studio()).results.find((result) => result.camera === 'front')?.mediaTime)
      .toBe(0);
    await expect.poll(() => tile().getByTestId('vision-box').count()).toBe(1);
    expect((await studio()).error).toBeNull();
    expect(app.errors).toEqual([]);
  });
});
