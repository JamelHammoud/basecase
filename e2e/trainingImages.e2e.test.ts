import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { matrixToEuler } from '../src/agent/agentFrame';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { buildRig } from '../src/utils/kinematics';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type ScenePart } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

interface ImageStudio {
  load: (record: unknown) => void;
  runCase: (id: string) => void;
  trainingImages: () => {
    running: unknown;
    last: { frameSet: { id: string; frames: unknown[] }; classCounts: Record<string, number> } | null;
  };
}

let app: App;

beforeEach(async () => {
  app = await openApp();
}, 120000);

afterEach(async () => {
  await app?.close();
});

describe('Training images', () => {
  it('makes a labelled block image from the palette and downloads its COCO and YOLO dataset', async () => {
    const { page } = app;
    const robot = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const built = buildCase(
      { goal: 'pick', world: 'floor' },
      builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
    );

    if (!built.ok) throw new Error(built.problem);

    const kase = built.kase;
    const block = kase.world.objects.find((object) => object.id === 'block')!;
    const top = Math.max(...robot.parts.map((part) => part.position[1] + part.dimensions.height / 2));
    const position: [number, number, number] = [60, top + 12, 0];
    const direction = new Vector3(...block.position).sub(new Vector3(...position)).normalize();
    const rotation = matrixToEuler(
      new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), direction)),
    );
    const camera: ScenePart = {
      id: 'wrist-camera',
      name: 'Wrist Camera',
      kind: 'component',
      role: 'solid',
      category: 'perception',
      componentId: 'raspberry-pi-camera-3',
      position,
      rotation,
      dimensions: { width: 25, height: 12, depth: 24 },
      color: '#333333',
      note: '',
      visible: true,
      locked: false,
    };
    const wrist = robot.joints.findLast((joint) => joint.type !== 'prismatic')!;
    const scene = {
      parts: [...robot.parts, camera],
      project: {
        ...DEFAULT_PROJECT,
        joints: robot.joints.map((joint) =>
          joint.id === wrist.id ? { ...joint, child: [...joint.child, camera.id] } : joint,
        ),
        cases: [kase],
      },
    };

    await page.evaluate((record) => (window as unknown as { __studio: ImageStudio }).__studio.load(record), scene);
    await expect.poll(() => partCount(page)).toBe(scene.parts.length);
    await page.evaluate((id) => (window as unknown as { __studio: ImageStudio }).__studio.runCase(id), kase.id);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await page.keyboard.type('Make Training Images');
    await page.keyboard.press('Enter');

    const sheet = page.getByRole('dialog', { name: 'Training images' });

    await sheet.waitFor();
    await sheet.getByRole('textbox', { name: 'Image count' }).fill('1');
    await sheet.getByRole('textbox', { name: 'Image count' }).press('Tab');
    await sheet.getByRole('switch', { name: 'Camera Scene' }).click();

    const classSwitches = sheet.getByRole('switch');
    const names = await classSwitches.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-label')!),
    );

    for (const name of names.filter((name) => name.startsWith('Class ') && name !== 'Class Block')) {
      await sheet.getByRole('switch', { name, exact: true }).click();
    }

    await sheet.locator('button', { hasText: 'Make Training Images' }).click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __studio: ImageStudio }).__studio.trainingImages().last?.frameSet.frames.length ??
              0,
          ),
        { timeout: 30000 },
      )
      .toBe(1);

    const result = await page.evaluate(
      () => (window as unknown as { __studio: ImageStudio }).__studio.trainingImages().last,
    );

    expect(result?.classCounts.Block).toBe(1);

    const pane = page.locator(shown('[data-testid="dataset-pane"]'));
    const downloaded = page.waitForEvent('download');

    await pane.getByRole('button', { name: 'Export Dataset', exact: true }).click();

    const download = await downloaded;
    const archive = unzipSync(await readFile((await download.path())!));
    const files = Object.fromEntries(
      Object.entries(archive)
        .filter(([name]) => name.includes('/coco/'))
        .map(([name, bytes]) => [name.slice(name.indexOf('/coco/') + 6), bytes]),
    );

    expect(download.suggestedFilename()).toMatch(/-dataset\.zip$/);
    expect(Object.keys(archive).some((name) => name.endsWith('/yolo/data.yaml'))).toBe(true);

    const splits = Object.entries(files).filter(([name]) => /^annotations\/instances_.*\.json$/.test(name));
    const coco = splits.map(([, bytes]) => JSON.parse(new TextDecoder().decode(bytes)));

    expect(coco.flatMap((split) => split.images)).toHaveLength(1);
    expect(Object.keys(files).filter((name) => /\.(png|jpe?g)$/.test(name))).toHaveLength(1);

    for (const split of coco) {
      const category = split.categories.find((entry: { name: string }) => entry.name === 'Block');
      const boxes = split.annotations.filter(
        (annotation: { category_id: number }) => annotation.category_id === category.id,
      );

      expect(new Set(boxes.map((annotation: { image_id: number }) => annotation.image_id)).size).toBe(
        split.images.length,
      );
      expect(
        boxes.every(
          (annotation: { bbox: number[] }) =>
            annotation.bbox.length === 4 && annotation.bbox[2] > 0 && annotation.bbox[3] > 0,
        ),
      ).toBe(true);
    }

    expect(await page.locator(shown('[data-testid="dataset-pane"]')).count()).toBe(1);
    expect(app.errors).toEqual([]);
  }, 60000);
});
