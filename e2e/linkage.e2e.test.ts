import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RobotJoint, ScenePart } from '../src/types/robotics';
import { couplerPoint, type PlacedFourBar, type Vec2 } from '../src/utils/linkage';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

const LEG: PlacedFourBar = {
  origin: [-40, 10],
  angle: 10,
  ground: 40,
  crank: 20,
  coupler: 50,
  rocker: 50,
  point: [80, 20],
};
const PATH: Vec2[] = Array.from({ length: 7 }, (_, i) => couplerPoint(LEG, 30 + i * 35)!);
const STEP_DEG = 3;

const plane = () => app.page.locator(shown('[data-testid="sketch-plane"]'));
const pathTab = () => app.page.locator(shown('[role="tab"]'), { hasText: /^Path$/ });
const choices = () => app.page.locator(shown('button'), { hasText: /^\d+\.\d mm$/ });
const drawn = () => app.page.locator(shown('[data-testid="linkage-solution"]'));
const pathPoints = () => plane().locator('[data-testid="path-point"]');

type Studio = {
  sceneRecord: () => { parts: ScenePart[]; project: { joints?: RobotJoint[] } };
  sketchPath: (points: Vec2[]) => void;
  setPose: (values: Record<string, number>) => void;
  posing: () => { pose?: { values: Record<string, number> } };
  posedPort: (id: string, port: string) => [number, number, number] | null;
};

const record = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord());

async function couplerAt(joint: string, value: number): Promise<Vec2> {
  await app.page.evaluate(([j, v]) => (window as unknown as { __studio: Studio }).__studio.setPose({ [j]: v }), [
    joint,
    value,
  ] as const);

  const at = await app.page.evaluate(
    async ([j, v, id]) => {
      const studio = (window as unknown as { __studio: Studio }).__studio;

      while (studio.posing().pose?.values[j] !== v) await new Promise(requestAnimationFrame);

      return studio.posedPort(id, 'P');
    },
    [joint, value, (await record()).parts.find((p) => p.name === 'Coupler')!.id] as const,
  );

  return [at![0], -at![2]];
}

function distanceToPolyline(p: Vec2, line: Vec2[]): number {
  return Math.min(
    ...line.slice(1).map((b, i) => {
      const a = line[i];
      const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
      const len = d[0] ** 2 + d[1] ** 2;
      const t = len ? Math.min(1, Math.max(0, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / len)) : 0;

      return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]);
    }),
  );
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('a four-bar from a path drawn in Sketch', () => {
  let before = 0;

  it('keeps its own undo for clicked points, then offers linkages drawn over the sketch with their error in mm', async () => {
    before = await partCount(app.page);
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Sketch');
    await app.page.keyboard.press('Enter');
    await expect.poll(() => plane().count()).toBe(1);

    await pathTab().click();

    for (const [x, y] of [
      [0.3, 0.3],
      [0.5, 0.6],
      [0.7, 0.4],
    ]) {
      const box = (await plane().boundingBox())!;

      await app.page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    }

    await expect.poll(() => pathPoints().count()).toBe(3);
    await app.page.keyboard.press('Meta+z');
    await expect.poll(() => pathPoints().count()).toBe(2);
    await app.page.keyboard.press('Meta+Shift+z');
    await expect.poll(() => pathPoints().count()).toBe(3);
    expect(await partCount(app.page)).toBe(before);

    await app.page.evaluate((points) => (window as unknown as { __studio: Studio }).__studio.sketchPath(points), PATH);

    await expect.poll(() => choices().count(), { timeout: 20000 }).toBeGreaterThan(0);
    expect(await drawn().count()).toBe(await choices().count());
    expect(Number((await choices().first().textContent())!.split(' ')[0])).toBeLessThan(2);
  });

  it('inserts the first one as printed bars with a servo turning the crank, and undo removes it', async () => {
    await choices().first().click();

    await expect.poll(() => partCount(app.page)).toBe(before + 5);
    expect(await plane().count()).toBe(0);

    const { parts, project } = await record();
    const crank = project.joints!.find((j) => j.type === 'revolute')!;
    const servo = parts.find((p) => p.componentId === 'feetech-sts3215')!;

    expect(parts.filter((p) => p.cad?.code.includes('four_bar(')).map((p) => p.name)).toEqual([
      'Ground',
      'Crank',
      'Coupler',
      'Rocker',
    ]);
    expect(crank.actuators).toEqual([servo.id]);

    await app.page.keyboard.press('Meta+z');
    await expect.poll(() => partCount(app.page)).toBe(before);
    expect((await record()).project.joints ?? []).toEqual([]);

    await app.page.keyboard.press('Meta+Shift+z');
    await expect.poll(() => partCount(app.page)).toBe(before + 5);
  });

  it('passes its coupler point within 2 mm of every drawn point as the crank sweeps', async () => {
    const crank = (await record()).project.joints!.find((j) => j.type === 'revolute')!;
    const [from, to] = crank.range!;
    const traced: Vec2[] = [];

    for (let v = from; v <= to; v += STEP_DEG) traced.push(await couplerAt(crank.id, v));

    traced.push(await couplerAt(crank.id, to));

    for (const target of PATH) expect(distanceToPolyline(target, traced)).toBeLessThan(2);

    expect(app.errors).toEqual([]);
  });
});
