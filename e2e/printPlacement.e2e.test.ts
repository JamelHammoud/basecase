import * as THREE from 'three';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Bed } from '../src/print/bed';
import type { PartPrint } from '../src/types/robotics';
import { openApp, type App } from './harness';

interface Studio {
  load: (record: unknown) => void;
  sceneRecord: () => { parts: Array<{ id: string; print?: PartPrint }>; project: Record<string, unknown> };
  printState: () => { open: boolean; bed: Bed | null };
  printPlates: () => { plates: string[][] };
}

let app: App;

const fixture = {
  id: 'bracket',
  name: 'Bracket',
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 5, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 30, height: 10, depth: 30 },
  color: '#eeeeee',
  note: '',
  mechanicalTag: '3D Printed PLA/PETG',
  visible: true,
  locked: false,
  print: { down: [0, -1, 0], plate: 1, at: [60, 60] },
};

const placement = () =>
  app.page.evaluate(
    () =>
      (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts.find((p) => p.id === 'bracket')?.print,
  );

async function screenPoint(point: [number, number, number]) {
  const box = await app.page.locator('[data-plate-canvas] canvas').boundingBox();
  const bed = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printState().bed);

  if (!box || !bed) throw new Error('Print canvas is unavailable');

  const camera = new THREE.PerspectiveCamera(35, box.width / box.height, 1, 20000);
  const center = new THREE.Vector3(bed.width / 2, Math.min(bed.height, 60) / 3, -bed.depth / 2);
  const span = Math.max(bed.width, bed.depth);

  camera.position.copy(center).add(new THREE.Vector3(0, span * 1.05, span * 1.25));
  camera.lookAt(center);
  camera.updateMatrixWorld();

  const projected = new THREE.Vector3(...point).project(camera);

  return { x: box.x + ((projected.x + 1) * box.width) / 2, y: box.y + ((1 - projected.y) * box.height) / 2 };
}

async function drag(from: [number, number, number], to: [number, number, number]) {
  const start = await screenPoint(from);
  const end = await screenPoint(to);

  await app.page.mouse.move(start.x, start.y);
  await app.page.mouse.down();
  await app.page.mouse.move(end.x, end.y, { steps: 3 });
  await app.page.mouse.up();
}

beforeAll(async () => {
  app = await openApp();
});

afterAll(async () => {
  await app?.close();
});

it('saves a clear drag, refuses a drop on a bed exclusion and clears placement with Auto Arrange', async () => {
  await app.page.evaluate((part) => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    studio.load({
      parts: [part],
      project: { ...studio.sceneRecord().project, printer: 'bambu-lab-p1s', labelParts: false },
    });
  }, fixture);
  await expect.poll(placement).toEqual(fixture.print);
  await app.page.keyboard.press('Meta+p');
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates().plates))
    .toEqual([['bracket']]);

  await drag([75, 5, -75], [120, 0, -75]);
  await expect.poll(async () => (await placement())?.at?.[0]).toBeGreaterThan(80);

  const clear = await placement();
  const [x, y] = clear!.at!;

  await drag([x + 15, 5, -(y + 15)], [-50, 0, 50]);
  expect(await placement()).toEqual(clear);
  expect(
    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates().plates),
  ).toEqual([['bracket']]);

  await app.page.getByRole('button', { name: 'Auto Arrange', exact: true }).click();
  await expect.poll(async () => (await placement())?.at).toBeUndefined();
  expect(app.errors).toEqual([]);
});

it.each([false, true])('recovers unsafe placements with another material on a plate: %s', async (withClearPart) => {
  await app.page.evaluate(
    ({ part, withClearPart }) => {
      const studio = (window as unknown as { __studio: Studio }).__studio;
      const unsafe = { ...part, printMaterial: 'PETG', print: { ...part.print, at: [0, 0] } };
      const clear = { ...part, id: 'clear', name: 'Clear', printMaterial: 'PLA' };

      studio.load({
        parts: withClearPart ? [unsafe, clear] : [unsafe],
        project: { ...studio.sceneRecord().project, printer: 'bambu-lab-p1s', labelParts: false },
      });
    },
    { part: fixture, withClearPart },
  );
  await expect.poll(async () => (await placement())?.at).toEqual([0, 0]);
  await app.page.keyboard.press('Meta+p');
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printState().bed))
    .not.toBeNull();
  expect(
    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates().plates),
  ).toEqual(withClearPart ? [['clear']] : []);

  await app.page.getByRole('button', { name: 'Auto Arrange', exact: true }).click();
  await expect.poll(async () => (await placement())?.at).toBeUndefined();
  await expect
    .poll(() =>
      app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates().plates.flat().sort()),
    )
    .toEqual(withClearPart ? ['bracket', 'clear'] : ['bracket']);
  expect(app.errors).toEqual([]);
});
