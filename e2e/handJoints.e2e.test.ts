import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { box } from '../src/sim/fixtures/parts';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

type P3 = [number, number, number];

interface Studio {
  load: (record: unknown) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => { project: { joints?: RobotJoint[] } };
  posing: () => { deltas: Map<string, unknown> };
  projectPoints: (points: P3[]) => Array<{ x: number; y: number; visible: boolean }>;
}

let app: App;

const PIN_RADIUS = 8;

const pin: ScenePart = {
  ...box('pin', [30, 60, 30], [PIN_RADIUS * 2, 40, PIN_RADIUS * 2], 10),
  name: 'Pin',
  kind: 'cylinder',
};

const parts = [box('base', [30, 20, 30], [80, 40, 80], 200), box('stand', [-90, 20, -90], [40, 40, 40], 100), pin];

const joints = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().project.joints ?? []);

const moved = () =>
  app.page.evaluate(() => [...(window as unknown as { __studio: Studio }).__studio.posing().deltas.keys()].sort());

const cursor = () =>
  app.page
    .locator(shown('.canvas-cursor'))
    .first()
    .evaluate((el) => (el as HTMLElement).style.cursor);

async function screenPoint(point: P3) {
  const [at] = await app.page.evaluate(
    (p) => (window as unknown as { __studio: Studio }).__studio.projectPoints([p]),
    point,
  );
  const frame = (await app.page.locator(shown('.canvas-cursor')).first().boundingBox())!;

  return { x: frame.x + at.x, y: frame.y + at.y };
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('joining two parts by hand', () => {
  it('adds a hinge about a clicked round face, turns only the child, and undoes in one step', async () => {
    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'Hinge',
      parts,
      project: DEFAULT_PROJECT,
    });
    await expect.poll(() => partCount(app.page)).toBe(parts.length);
    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.select(['base', 'pin']));

    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Add Hinge');
    await app.page.keyboard.press('Enter');
    await expect.poll(cursor).toBe('not-allowed');

    const top = await screenPoint([60, 40, 60]);

    await app.page.mouse.move(top.x, top.y);
    await app.page.mouse.click(top.x, top.y);
    await app.page.waitForTimeout(300);
    expect(await joints()).toEqual([]);

    const side = await screenPoint([30 + PIN_RADIUS * Math.SQRT1_2, 60, 30 + PIN_RADIUS * Math.SQRT1_2]);

    await app.page.mouse.move(side.x, side.y);
    await expect.poll(cursor).toContain('image-set');
    await app.page.mouse.click(side.x, side.y);

    await expect.poll(async () => (await joints()).length).toBe(1);

    const [hinge] = await joints();

    expect(hinge).toMatchObject({ type: 'revolute', parent: ['base'], child: ['pin'], range: [-90, 90] });
    expect(Math.abs(hinge.axis[1])).toBeGreaterThan(0.999);
    expect(Math.hypot(hinge.origin[0] - 30, hinge.origin[2] - 30)).toBeLessThan(0.1);

    const degrees = app.page.locator(shown('input[aria-label="Pin degrees"]')).first();

    await expect.poll(() => degrees.count()).toBe(1);
    await degrees.click();
    await degrees.fill('30');
    await degrees.press('Enter');
    await expect.poll(moved).toEqual(['pin']);

    await app.page.keyboard.press('Meta+z');
    await expect.poll(moved).toEqual([]);
    expect(await joints()).toHaveLength(1);
    await app.page.keyboard.press('Meta+z');
    await expect.poll(async () => (await joints()).length).toBe(0);
  });
});
