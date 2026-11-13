import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';

type Vec3 = [number, number, number];

interface Part {
  id: string;
  kind: string;
  role: string;
  position: Vec3;
  rotation: Vec3;
  dimensions: { width: number; height: number; depth: number };
  sketch?: unknown;
}

interface Studio {
  load: (record: { parts: unknown[] }) => void;
  sceneRecord: () => { parts: Part[] };
  selectFace: (id: string, normal: Vec3) => void;
  triangleCount: (id: string) => number;
  project: (points: Vec3[]) => Array<{ x: number; y: number; visible: boolean }>;
}

let app: App;

const BASE = {
  id: 'base',
  name: 'Base',
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 10, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 80, height: 20, depth: 60 },
  color: '#a1a1aa',
  note: '',
  visible: true,
  locked: false,
};

type WithStudio = { __studio: Studio };

const sceneParts = () => app.page.evaluate(() => (window as unknown as WithStudio).__studio.sceneRecord().parts);
const sketched = async () => (await sceneParts()).find((p) => p.sketch);

const plane = () => app.page.locator(shown('[data-testid="sketch-plane"]'));

const at = async (fx: number, fy: number) => {
  const box = (await plane().boundingBox())!;

  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
};

const openSketchFromPalette = async () => {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Sketch');
  await app.page.keyboard.press('Enter');
  await expect.poll(() => plane().count()).toBe(1);
};

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate((part) => (window as unknown as WithStudio).__studio.load({ parts: [part] }), BASE);
  await app.page.waitForFunction(() => (window as unknown as WithStudio).__studio.triangleCount('base') > 0, null, {
    timeout: 30000,
  });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('sketch on a face', () => {
  it('opens on the selected top face of a box from ⌘K', async () => {
    await app.page.evaluate(() => (window as unknown as WithStudio).__studio.selectFace('base', [0, 1, 0]));
    await openSketchFromPalette();

    expect(await plane().locator('svg path[stroke-dasharray]').count()).toBe(4);
  });

  it('draws a rectangle from typed lengths and extrudes it 5 mm onto the face', async () => {
    await app.page.getByRole('button', { name: 'Rectangle', exact: true }).click();

    const corner = await at(0.3, 0.6);
    const toward = await at(0.7, 0.4);

    await app.page.mouse.click(corner.x, corner.y);
    await app.page.mouse.move(toward.x, toward.y, { steps: 4 });
    await app.page.keyboard.type('40');
    await app.page.keyboard.press('Tab');
    await app.page.keyboard.type('20');
    await app.page.keyboard.press('Enter');

    await expect.poll(() => plane().locator('button', { hasText: /^40$/ }).count()).toBe(1);
    expect(await plane().locator('button', { hasText: /^20$/ }).count()).toBe(1);

    const thickness = app.page.locator(shown('input[aria-label="Thickness"]'));

    await thickness.fill('5');
    await thickness.press('Enter');
    await app.page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect.poll(async () => (await sketched())?.dimensions).toMatchObject({ width: 40, height: 5, depth: 20 });

    const part = (await sketched())!;

    expect(part.role).toBe('solid');
    expect(part.rotation).toEqual([0, 0, 0]);
    expect(part.position[1]).toBeCloseTo(22.5, 6);
    expect(Math.abs(part.position[0]) + 20).toBeLessThanOrEqual(40);
    expect(Math.abs(part.position[2]) + 10).toBeLessThanOrEqual(30);
  });

  it('reopens the sketch on double-click and re-extrudes when a length changes', async () => {
    const part = (await sketched())!;
    const top: Vec3 = [part.position[0], 25, part.position[2]];
    const [p] = await app.page.evaluate((point) => (window as unknown as WithStudio).__studio.project([point]), top);
    const canvas = (await app.page.locator(shown('.canvas-cursor')).first().boundingBox())!;

    expect(p.visible).toBe(true);

    await app.page.mouse.dblclick(canvas.x + p.x, canvas.y + p.y);
    await expect.poll(() => plane().count()).toBe(1);

    await plane().locator('button', { hasText: /^40$/ }).click();

    const field = plane().locator('input');

    await field.fill('50');
    await field.press('Enter');

    await expect.poll(async () => (await sketched())?.dimensions.width).toBe(50);
    expect((await sketched())?.dimensions).toMatchObject({ height: 5, depth: 20 });
    expect((await sketched())?.position[1]).toBeCloseTo(22.5, 6);
  });

  it('undoes the change in one step, back to 40', async () => {
    await app.page.keyboard.press('ControlOrMeta+z');

    await expect.poll(async () => (await sketched())?.dimensions.width).toBe(40);
    await expect.poll(() => plane().locator('button', { hasText: /^40$/ }).count()).toBe(1);
    expect(app.errors).toEqual([]);
  });
});
