import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hardwareDimensions, type HardwareSpec } from '../src/data/hardware';
import { openApp, shown, type App } from './harness';

let app: App;

interface Part {
  id: string;
  kind: string;
  boolean?: { op: string; operands: Array<{ id: string; position: number[] }> };
}

interface Studio {
  sceneRecord: () => { parts: Part[] };
  meshByColor: () => Record<string, number[]>;
  load: (record: { parts: unknown[] }) => void;
  select: (ids: string[]) => void;
}

const shape = (id: string, kind: string, dimensions: object) => ({
  id,
  name: id === 'plate' ? 'Plate' : 'Pin',
  kind,
  category: 'primitives',
  role: 'solid',
  position: [0, 10, 0],
  rotation: [0, 0, 0],
  dimensions,
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

const record = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts);

const triangles = () =>
  app.page.evaluate(() => Object.values((window as unknown as { __studio: Studio }).__studio.meshByColor()).flat());

function bounds(t: number[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  t.forEach((v, i) => {
    min[i % 3] = Math.min(min[i % 3], v);
    max[i % 3] = Math.max(max[i % 3], v);
  });

  return [...min, ...max].map((v) => Math.round(v * 100) / 100);
}

type Point = [number, number];

const side = (a: Point, b: Point, p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

function covers(t: number[], i: number, p: Point): boolean {
  const a: Point = [t[i], t[i + 2]];
  const b: Point = [t[i + 3], t[i + 5]];
  const c: Point = [t[i + 6], t[i + 8]];

  if (Math.abs(side(a, b, c)) < 1e-9) return false;

  const d = [side(a, b, p), side(b, c, p), side(c, a, p)];

  return d.every((v) => v >= 0) || d.every((v) => v <= 0);
}

function verticalRayHits(t: number[], x: number, z: number): boolean {
  for (let i = 0; i < t.length; i += 9) {
    if (covers(t, i, [x, z])) return true;
  }

  return false;
}

const span = (t: number[]) => {
  const [minX, , , maxX] = bounds(t);

  return Math.round((maxX - minX) * 100) / 100;
};

const SCREW: HardwareSpec = { type: 'socket_head', size: 'M3', length: 20 };

async function unite(parts: object[]) {
  await app.page.evaluate((list) => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    studio.load({ parts: list });
    studio.select(['plate', 'pin']);
  }, parts);
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Union');
  await app.page.keyboard.press('Enter');
  await expect.poll(async () => (await record()).map((p) => p.kind)).toEqual(['boolean']);
  await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.select(['plate']));
}

const holeAt = async (x: number) => !verticalRayHits(await triangles(), x, 0);

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate(
    (parts) => {
      const studio = (window as unknown as { __studio: Studio }).__studio;

      studio.load({ parts });
      studio.select(['plate', 'pin']);
    },
    [
      shape('plate', 'box', { width: 60, height: 20, depth: 40 }),
      shape('pin', 'cylinder', { width: 10, height: 40, depth: 10 }),
    ],
  );
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('editable booleans', () => {
  it('subtracts from ⌘K and keeps both operands under the result in Layers', async () => {
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).first().click();
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Subtract');
    await app.page.keyboard.press('Enter');

    await expect.poll(async () => (await record()).map((p) => p.kind)).toEqual(['boolean']);

    const [result] = await record();

    expect(result.id).toBe('plate');
    expect(result.boolean?.op).toBe('subtract');
    expect(result.boolean?.operands.map((o) => o.id)).toHaveLength(2);
    expect(result.boolean?.operands[1].id).toBe('pin');
    await expect.poll(() => app.page.locator(shown(`[data-operand-of="${result.id}"]`)).count()).toBe(2);
    await expect.poll(() => holeAt(0)).toBe(true);
  });

  it('moves the hole when the cylinder moves 10 mm, and undo puts it back', async () => {
    const before = bounds(await triangles());

    await app.page.locator(shown('[data-layer-row="part:pin"]')).first().click();

    const x = app.page.locator(shown('input[aria-label="Position X"]')).first();

    await x.fill('10');
    await x.press('Enter');
    await app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    await expect.poll(async () => (await record())[0].boolean?.operands[1].position[0]).toBe(10);
    await expect.poll(() => holeAt(10), { timeout: 15000 }).toBe(true);
    expect(await holeAt(0)).toBe(false);
    expect(bounds(await triangles())).toEqual(before);

    await app.page.keyboard.press('Meta+z');

    await expect.poll(() => holeAt(0)).toBe(true);
    expect(await holeAt(10)).toBe(false);
    expect(app.errors).toEqual([]);
  });

  it('resizes a union from the Inspector and keeps the new width', async () => {
    await unite([
      shape('plate', 'box', { width: 60, height: 20, depth: 40 }),
      { ...shape('pin', 'cylinder', { width: 10, height: 40, depth: 10 }), position: [30, 10, 0] },
    ]);

    const width = app.page.locator(shown('input[aria-label="Width (X)"]')).first();

    await expect.poll(() => width.inputValue()).toBe('65');
    await width.fill('130');
    await width.press('Enter');

    await expect.poll(async () => span(await triangles()), { timeout: 15000 }).toBe(130);
    expect(await width.inputValue()).toBe('130');
    expect(app.errors).toEqual([]);
  });

  it('locks the size a screw in a union sets, and says how to resize it', async () => {
    await unite([
      { ...shape('plate', 'box', { width: 2, height: 2, depth: 2 }), position: [0, 20, 0] },
      {
        ...shape('pin', 'hardware', hardwareDimensions(SCREW)),
        name: 'M3 Screw',
        category: 'hardware',
        hardware: SCREW,
        position: [0, 20, 0],
      },
    ]);

    const width = app.page.locator(shown('input[aria-label="Width (X)"]')).first();

    await expect.poll(() => width.isDisabled()).toBe(true);
    expect(await app.page.locator(shown('[data-testid="size-fixed"]')).innerText()).toBe(
      'M3 Screw keeps its shape. Resize the parts in Layers.',
    );
    expect(app.errors).toEqual([]);
  });
});
