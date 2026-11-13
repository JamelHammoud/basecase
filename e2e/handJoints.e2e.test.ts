import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { specToPart } from '../src/agent/agentScene';
import { DEFAULT_PROJECT, type RobotJoint } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

type V3 = [number, number, number];

interface Studio {
  load: (record: unknown) => void;
  select: (ids: string[]) => void;
  frameAll: () => void;
  screenPoints: (points: V3[]) => Array<{ x: number; y: number }>;
  sceneRecord: () => { project: { joints?: RobotJoint[] } };
  posing: () => { deltas: Map<string, { equals: (m: unknown) => boolean; constructor: new () => unknown }> };
}

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const studio = <T>(fn: (s: Studio, input: unknown) => T, input?: unknown) =>
  app.page.evaluate(`(${fn.toString()})(window.__studio, ${JSON.stringify(input ?? null)})`) as Promise<Awaited<T>>;

const cursor = () => app.page.locator(visible('.canvas-cursor')).evaluate((el) => (el as HTMLElement).style.cursor);

const joints = () => studio((s) => s.sceneRecord().project.joints ?? []);

const movedParts = () =>
  studio((s) =>
    [...s.posing().deltas]
      .filter(([, m]) => !m.equals(new (m.constructor as new () => unknown)()))
      .map(([id]) => id)
      .sort(),
  );

const PIN_CENTER: V3 = [-60, 25, 0];

async function clickScenePoint(point: V3) {
  const [screen] = await studio((s, p) => s.screenPoints([p as V3]), point);
  const box = (await app.page.locator(visible('.canvas-cursor')).boundingBox())!;

  await app.page.mouse.click(box.x + screen.x, box.y + screen.y);
}

beforeAll(async () => {
  app = await openApp();

  const parts = [
    specToPart({ id: 'base', name: 'Base', shape: 'box', size: [60, 40, 20], position: [0, 0, 10] }),
    specToPart({ id: 'arm', name: 'Arm', shape: 'box', size: [20, 40, 80], position: [60, 0, 40] }),
    specToPart({ id: 'pin', name: 'Pin', shape: 'cylinder', size: [10, 10, 50], position: [-60, 0, 25] }),
  ];

  await studio((s, record) => s.load(record), { name: 'Hinge', parts, project: DEFAULT_PROJECT });
  await app.page.waitForFunction(
    () => (window as unknown as { __studio: { parts: () => unknown[] } }).__studio.parts().length === 3,
  );
  await studio((s) => s.frameAll());
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('joining two parts by hand', () => {
  it('adds a hinge from ⌘K on the axis of a clicked round face', async () => {
    await studio((s) => s.select(['base', 'arm']));

    const idle = await cursor();

    await app.page.keyboard.press('ControlOrMeta+k');
    await app.page.keyboard.type('Add Hinge');
    await app.page.keyboard.press('Enter');
    await expect.poll(cursor).not.toBe(idle);
    expect(await joints()).toEqual([]);

    await clickScenePoint(PIN_CENTER);
    await expect.poll(async () => (await joints()).length).toBe(1);

    const [hinge] = await joints();

    expect(hinge).toMatchObject({ type: 'revolute', parent: ['base'], child: ['arm'], range: [-90, 90] });
    expect(Math.abs(hinge.axis[1])).toBeGreaterThan(0.999);
    expect(Math.hypot(hinge.origin[0] - PIN_CENTER[0], hinge.origin[2] - PIN_CENTER[2])).toBeLessThan(0.1);
    await expect
      .poll(() => app.page.locator(visible('[role=tab][aria-selected=true]'), { hasText: 'Pose' }).count())
      .toBe(1);
  });

  it('turns only the child from the Pose tab', async () => {
    const value = app.page.locator(visible(`[data-joint="${(await joints())[0].id}"] input[aria-label$="degrees"]`));

    await value.click();
    await value.fill('45');
    await value.press('Enter');
    await expect.poll(movedParts).toEqual(['arm']);
  });

  it('removes the hinge in one undo step after the pose edit', async () => {
    await app.page.keyboard.press('ControlOrMeta+z');
    await expect.poll(movedParts).toEqual([]);
    expect(await joints()).toHaveLength(1);

    await app.page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await joints()).length).toBe(0);
    expect(await partCount(app.page)).toBe(3);
    expect(await cursor()).not.toContain('crosshair');
  });
});
