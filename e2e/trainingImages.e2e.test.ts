import fs from 'node:fs/promises';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { box } from '../src/sim/fixtures/parts';
import type { Dataset } from '../src/datasets/datasetFile';
import type { FrameSetSummary } from '../src/vision/frameSetStore';
import type { VisionFrameSet } from '../src/vision/frameSet';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

type Studio = {
  load: (record: unknown) => void;
  frameSets: () => Promise<FrameSetSummary[]>;
  frameSet: (id: string) => Promise<VisionFrameSet | null>;
  datasets: () => Dataset[];
};

beforeEach(async () => {
  app = await openApp();
}, 120000);
afterEach(async () => {
  await app?.close();
});

describe('training images from a Case', () => {
  it('makes and exports one image through the sheet and opens its saved Dataset', async () => {
    const robot = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const result = buildCase(
      { goal: 'pick', world: 'floor' },
      builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
    );

    if (!result.ok) throw new Error(result.problem);

    const stand = box('stand', [0, 25, 0], [60, 50, 60], 100);

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'Image scene',
      parts: [stand],
      project: { ...DEFAULT_PROJECT, cases: [result.kase] },
    });
    await expect.poll(() => partCount(app.page)).toBe(1);
    await app.page.keyboard.press('Meta+k');
    await app.page.getByLabel('Search commands').fill('Make Training Images');
    await app.page.locator(shown('button[data-idx]')).filter({ hasText: 'Make Training Images' }).first().click();

    const dialog = app.page.getByRole('dialog', { name: 'Make Training Images' });

    await dialog.getByLabel('Count', { exact: true }).fill('1');
    await dialog.getByRole('button', { name: 'Make Training Images', exact: true }).click();
    await expect.poll(() => app.page.getByTestId('dataset-pane').count()).toBe(1);
    await expect.poll(() => app.page.getByTestId('dataset-frame').locator('img').count()).toBe(1);

    const stored = await app.page.evaluate(async () => {
      const studio = (window as unknown as { __studio: Studio }).__studio;
      const [summary] = await studio.frameSets();

      return { summary, set: await studio.frameSet(summary.id), datasets: studio.datasets() };
    });

    expect(stored.summary.frames).toBe(1);
    expect(stored.set?.frames[0].annotations.length).toBeGreaterThan(0);
    expect(stored.datasets.at(-1)?.imageMembers).toEqual([
      { frameSet: stored.summary.id, hash: stored.summary.id, frames: [stored.set!.frames[0].id] },
    ]);

    const downloading = app.page.waitForEvent('download');

    await app.page.getByTestId('dataset-pane').getByRole('button', { name: 'Export Dataset', exact: true }).click();

    const download = await downloading;

    expect(download.suggestedFilename()).toMatch(/-dataset\.zip$/);
    expect(await download.failure()).toBeNull();

    const files = unzipSync(await fs.readFile((await download.path())!));
    const annotations = Object.entries(files)
      .filter(([path]) => /\/coco\/annotations\/instances_.*\.json$/.test(path))
      .map(([, bytes]) => JSON.parse(new TextDecoder().decode(bytes)));

    expect(annotations.flatMap((split) => split.images)).toHaveLength(1);
    expect(annotations.flatMap((split) => split.annotations).length).toBeGreaterThan(0);
    expect(Object.keys(files).filter((path) => /\/yolo\/images\/.+\.jpg$/.test(path))).toHaveLength(1);
    expect(app.errors).toEqual([]);
  });

  it('opens camera and class choices from the command palette', async () => {
    const robot = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const result = buildCase(
      { goal: 'pick', world: 'floor' },
      builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
    );

    if (!result.ok) throw new Error(result.problem);

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: robot.id,
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [result.kase] },
    });
    await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
    await app.page.keyboard.press('Meta+k');
    await app.page.getByLabel('Search commands').fill('Make Training Images');
    await app.page.locator(shown('button[data-idx]')).filter({ hasText: 'Make Training Images' }).first().click();

    const dialog = app.page.getByRole('dialog', { name: 'Make Training Images' });

    await dialog.getByLabel('Count', { exact: true }).fill('2');
    await dialog.getByLabel('Count', { exact: true }).press('Tab');
    expect(await dialog.getByLabel('Count', { exact: true }).inputValue()).toBe('2');

    const make = dialog.getByRole('button', { name: 'Make Training Images', exact: true });
    const camera = dialog.getByRole('switch', { name: 'Scene', exact: true });
    const block = dialog.getByRole('switch', { name: 'Block', exact: true });

    expect(await camera.getAttribute('aria-checked')).toBe('true');
    expect(await block.getAttribute('aria-checked')).toBe('true');
    expect(await make.isEnabled()).toBe(true);
    await camera.click();
    await expect.poll(() => make.isEnabled()).toBe(false);
    await camera.click();
    await expect.poll(() => make.isEnabled()).toBe(true);

    const switches = dialog.getByRole('switch');

    for (const choice of await switches.all()) {
      if ((await choice.getAttribute('aria-label')) !== 'Scene') await choice.click();
    }

    await expect.poll(() => make.isEnabled()).toBe(false);
    await block.click();
    await expect.poll(() => make.isEnabled()).toBe(true);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect.poll(() => dialog.count()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});
