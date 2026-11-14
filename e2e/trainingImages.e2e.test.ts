import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

type Frame = { id: string; width: number; height: number; annotations: Array<{ classId: number; bbox: number[] }> };

type FrameSet = { id: string; frames: Frame[]; classes: Array<{ id: number; name: string }> };

type Studio = {
  load: (record: unknown) => void;
  frameSets: () => Promise<Array<{ id: string; frames: number }>>;
  frameSet: (id: string) => Promise<FrameSet>;
  datasetFiles: () => Promise<Record<string, string>>;
  trainingImages: () => { busy: boolean; problem: string | null };
  datasets: () => Array<{ id: string; imageMembers?: Array<{ frameSet: string }> }>;
};

const studio = <T>(fn: (s: Studio) => T) =>
  app.page.evaluate(`(${fn.toString()})(window.__studio)`) as Promise<Awaited<T>>;

beforeEach(async () => {
  app = await openApp();
}, 120000);
afterEach(async () => {
  await app?.close();
});

describe('training images from a Case', () => {
  it('makes a labelled arm image batch through the command palette and exports COCO', async () => {
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
    await dialog.getByRole('button', { name: 'Make Training Images', exact: true }).click();
    await expect.poll(async () => (await studio((s) => s.frameSets())).length).toBe(1);
    await expect.poll(async () => (await studio((s) => s.trainingImages())).busy).toBe(false);
    expect((await studio((s) => s.trainingImages())).problem).toBeNull();

    const [summary] = await studio((s) => s.frameSets());
    const set = await app.page.evaluate(
      (id) => (window as unknown as { __studio: Studio }).__studio.frameSet(id),
      summary.id,
    );

    expect(set.frames).toHaveLength(2);
    expect(summary.frames).toBe(2);

    const block = set.classes.find((c) => c.name === 'Block')!;

    expect(block).toBeDefined();
    expect(set.frames.every((f) => f.annotations.some((a) => a.classId === block.id))).toBe(true);

    for (const frame of set.frames)
      for (const annotation of frame.annotations) {
        const [x, y, w, h] = annotation.bbox;

        expect([x, y, w, h].every(Number.isFinite)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        expect(x + w).toBeLessThanOrEqual(frame.width);
        expect(y + h).toBeLessThanOrEqual(frame.height);
      }

    const files = await studio((s) => s.datasetFiles());
    const splits = Object.entries(files)
      .filter(([name]) => /(?:^|\/)coco\/annotations\/instances_.*\.json$/.test(name))
      .map(([, bytes]) => JSON.parse(Buffer.from(bytes, 'base64').toString('utf8')));
    const coco = {
      images: splits.flatMap((s) => s.images),
      annotations: splits.flatMap((s) => s.annotations),
      categories: splits[0].categories,
    };
    const exportedBlock = coco.categories.find((category: { name: string }) => category.name === 'Block');

    expect(coco.images).toHaveLength(2);
    expect(exportedBlock).toBeDefined();
    expect(coco.annotations.filter((a: { category_id: number }) => a.category_id === exportedBlock.id)).toHaveLength(2);
    expect(coco.categories).toHaveLength(set.classes.length);
    expect(coco.categories).toEqual(
      expect.arrayContaining(set.classes.map((c) => expect.objectContaining({ name: c.name }))),
    );
    expect(Object.keys(files).filter((name) => /(?:^|\/)coco\/images\/.+\.jpe?g$/.test(name))).toHaveLength(2);
    expect((await studio((s) => s.datasets())).some((d) => d.imageMembers?.some((m) => m.frameSet === set.id))).toBe(
      true,
    );
    expect(app.errors).toEqual([]);
  });
});
