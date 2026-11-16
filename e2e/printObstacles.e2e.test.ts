import * as THREE from 'three';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PrinterModel } from '../src/data/printers';
import { overlaps, type Bed } from '../src/print/bed';
import type { PlanItem } from '../src/print/plan';
import { openApp, shown, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => { parts: Array<{ print?: unknown }>; project: unknown };
  obstaclePrinter: (geometry: Partial<PrinterModel>) => void;
  printState: () => { bed: Bed; placements: PlanItem[] };
}

const state = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printState());

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

async function screenPoint(point: THREE.Vector3, bed: Bed) {
  const rect = await app.page.locator('[data-plate-canvas] canvas').boundingBox();

  if (!rect) throw new Error('Print canvas is missing');

  const center = new THREE.Vector3(bed.width / 2, Math.min(bed.height, 60) / 3, -bed.depth / 2);
  const span = Math.max(bed.width, bed.depth);
  const camera = new THREE.PerspectiveCamera(35, rect.width / rect.height, 1, 20000);

  camera.position.set(center.x, center.y + span * 1.05, center.z + span * 1.25);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  point.project(camera);

  const ray = new THREE.Raycaster();

  ray.setFromCamera(new THREE.Vector2(point.x, point.y), camera);

  const bedPoint = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())!;

  return {
    x: rect.x + ((point.x + 1) * rect.width) / 2,
    y: rect.y + ((1 - point.y) * rect.height) / 2,
    bedPoint,
  };
}

async function dragItem(item: PlanItem, bed: Bed, target: [number, number]) {
  const start = await screenPoint(new THREE.Vector3(item.x + item.w / 2, item.h, -item.y - item.d / 2), bed);
  const end = await screenPoint(
    start.bedPoint.clone().add(new THREE.Vector3(target[0] - item.x - item.w / 2, 0, item.y + item.d / 2 - target[1])),
    bed,
  );

  await app.page.mouse.move(start.x, start.y);
  await app.page.mouse.down();
  await app.page.mouse.move(end.x, end.y, { steps: 10 });
  await app.page.mouse.up();
}

it('arranges around clips and tool docks, and refuses a drag into their clearance', async () => {
  await app.page.evaluate(() => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    studio.obstaclePrinter({
      bed: [
        [0, 0],
        [200, 0],
        [200, 200],
        [0, 200],
      ],
      keepOut: [],
      obstacles: [
        {
          polygon: [
            [80, 70],
            [120, 70],
            [120, 130],
            [80, 130],
          ],
          zMin: 0,
          zMax: 4,
        },
        {
          polygon: [
            [150, 150],
            [200, 150],
            [200, 200],
            [150, 200],
          ],
          zMin: 0,
          zMax: 80,
        },
      ],
      toolheadClearance: { radius: 10, height: 20 },
    });
    studio.load({
      parts: [
        {
          id: 'obstacle-bracket',
          name: 'Clip bracket',
          kind: 'box',
          category: 'primitives',
          role: 'solid',
          position: [0, 5, 0],
          rotation: [0, 0, 0],
          dimensions: { width: 30, height: 10, depth: 30 },
          color: '#e4e4e7',
          note: '',
          mechanicalTag: '3D Printed PLA/PETG',
          visible: true,
          locked: false,
        },
      ],
      project: studio.sceneRecord().project,
    });
  });
  await app.page
    .locator('main')
    .first()
    .click({ position: { x: 20, y: 20 } });
  await app.page.keyboard.press('Meta+p');
  await expect.poll(async () => (await state()).placements?.length).toBe(1);
  await app.page.locator(shown('button'), { hasText: /^Auto Arrange$/ }).click();

  const arranged = await state();
  const item = arranged.placements[0];

  expect(arranged.bed.keepOut).toHaveLength(2);
  expect(arranged.bed.keepOut.some((obstacle) => overlaps(item, obstacle))).toBe(false);

  await dragItem(item, arranged.bed, [item.x + item.w / 2 + 10, item.y + item.d / 2]);
  await expect
    .poll(async () => {
      const record = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord());

      return record.parts[0].print;
    })
    .toMatchObject({ at: [item.x + 10, item.y] });

  const moved = await state();
  const before = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord());

  await dragItem(moved.placements[0], moved.bed, [100, 100]);
  await expect.poll(async () => (await state()).placements).toEqual(moved.placements);
  expect(await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord())).toEqual(
    before,
  );
  expect(app.errors).toEqual([]);
});
