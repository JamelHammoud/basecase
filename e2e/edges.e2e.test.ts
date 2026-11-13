import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScenePart } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

type Studio = {
  select: (ids: string[]) => void;
  load: (record: { parts: ScenePart[]; project: unknown }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: unknown };
  partTriangles: (id: string) => number[];
};

type V3 = [number, number, number];

const thePart = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts[0]);

const trianglesOf = (id: string) =>
  app.page.evaluate((partId) => (window as unknown as { __studio: Studio }).__studio.partTriangles(partId), id);

function bounds(t: number[]): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < t.length; i++) {
    min[i % 3] = Math.min(min[i % 3], t[i]);
    max[i % 3] = Math.max(max[i % 3], t[i]);
  }

  return { min, max };
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function rayHits(t: number[], origin: V3, dir: V3): boolean {
  for (let i = 0; i < t.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((k) => t.slice(i + k, i + k + 3) as V3);
    const [e1, e2] = [sub(b, a), sub(c, a)];
    const p = cross(dir, e2);
    const det = dot(e1, p);

    if (Math.abs(det) < 1e-9) continue;

    const s = sub(origin, a);
    const u = dot(s, p) / det;
    const v = dot(dir, cross(s, e1)) / det;

    if (u >= 0 && v >= 0 && u + v <= 1 && dot(e2, cross(s, e1)) / det > 0) return true;
  }

  return false;
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Edges in the Inspector', () => {
  it('fillets a cube by 3 mm inside its old bounds, so its sharp corner is gone, and undoes it', async () => {
    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().click();
    await expect.poll(() => partCount(app.page)).toBe(1);

    const { id, dimensions } = await thePart();
    const triangles = () => trianglesOf(id);
    const corner = (): V3 => [-dimensions.width, dimensions.height / 2 - 0.2, dimensions.depth / 2 - 0.2];
    const sharp = await triangles();

    expect(rayHits(sharp, corner(), [1, 0, 0])).toBe(true);

    await app.page.evaluate((partId) => (window as unknown as { __studio: Studio }).__studio.select([partId]), id);

    const shape = app.page.locator(shown('button[aria-expanded]'), { hasText: /^Shape$/ });

    if ((await shape.getAttribute('aria-expanded')) === 'false') await shape.click();

    await app.page.locator(shown('[role="tab"]'), { hasText: /^Fillet$/ }).click();

    const size = app.page.locator(shown('input[aria-label="Fillet"]'));

    await size.fill('3');
    await size.press('Enter');

    await expect.poll(async () => (await thePart()).edges).toEqual({ kind: 'fillet', mm: 3 });
    await expect.poll(async () => rayHits(await triangles(), corner(), [1, 0, 0])).toBe(false);

    const filleted = bounds(await triangles());
    const before = bounds(sharp);

    filleted.min.forEach((v, i) => expect(v).toBeCloseTo(before.min[i], 2));
    filleted.max.forEach((v, i) => expect(v).toBeCloseTo(before.max[i], 2));

    await app.page.keyboard.press('Meta+z');

    await expect.poll(async () => (await thePart()).edges?.mm ?? 0).toBe(0);
    await expect.poll(async () => rayHits(await triangles(), corner(), [1, 0, 0])).toBe(true);
    expect(app.errors).toEqual([]);
  });

  it('keeps an old part’s Round slider through a drag to 0, so ⌘Z brings Round back', async () => {
    await app.page.evaluate(() => {
      const studio = (window as unknown as { __studio: Studio }).__studio;
      const { parts, project } = studio.sceneRecord();

      studio.load({ parts: parts.map((p) => ({ ...p, deformers: { ...p.deformers, roundness: 0.5 } })), project });
    });

    const { id } = await thePart();

    await app.page.evaluate((partId) => (window as unknown as { __studio: Studio }).__studio.select([partId]), id);

    const shape = app.page.locator(shown('button[aria-expanded]'), { hasText: /^Shape$/ });

    if ((await shape.getAttribute('aria-expanded')) === 'false') await shape.click();

    const round = app.page.locator(shown('input[aria-label="Round"]'));

    await expect.poll(() => round.count()).toBe(1);

    const box = (await round.boundingBox())!;
    const y = box.y + box.height / 2;

    await app.page.mouse.move(box.x + box.width / 2, y);
    await app.page.mouse.down();
    await app.page.mouse.move(box.x + 1, y, { steps: 5 });
    await app.page.mouse.up();

    await expect.poll(async () => (await thePart()).deformers?.roundness ?? 0).toBe(0);
    await expect.poll(() => round.count()).toBe(0);

    await app.page.keyboard.press('Meta+z');

    await expect.poll(async () => (await thePart()).deformers?.roundness).toBe(0.5);
    expect(app.errors).toEqual([]);
  });
});
