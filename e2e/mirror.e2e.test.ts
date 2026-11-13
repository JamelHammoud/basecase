import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { V3 } from '../src/agent/agentFrame';
import { specToPart } from '../src/agent/agentScene';
import { findPort, worldPort } from '../src/agent/ports';
import { box } from '../src/sim/fixtures/parts';
import { DEFAULT_PROJECT, type ScenePart } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

interface Studio {
  load: (record: unknown) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => { parts: ScenePart[] };
}

let app: App;

const block = box('block', [60, 10, 30], [20, 20, 20], 10);
const servo: ScenePart = {
  ...specToPart({ id: 'servo', catalog: 'component:feetech-sts3215|c018' }),
  position: [120, 20, 30],
  rotation: [0, 0, 0],
};

const record = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts);

const gap = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('mirroring by hand', () => {
  it('mirrors a box and a servo from ⌘K, keeps the servo a real STS3215, and undoes in one step', async () => {
    await app.page.evaluate((r) => (window as unknown as { __studio: Studio }).__studio.load(r), {
      name: 'Mirror',
      parts: [block, servo],
      project: DEFAULT_PROJECT,
    });
    await expect.poll(() => partCount(app.page)).toBe(2);
    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.select(['block', 'servo']));

    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Mirror');
    await app.page.keyboard.press('Enter');
    await expect.poll(() => partCount(app.page)).toBe(4);

    const copies = (await record()).filter((p) => p.id !== 'block' && p.id !== 'servo');
    const blockCopy = copies.find((p) => p.kind === 'box')!;
    const servoCopy = copies.find((p) => p.kind === 'component')!;
    const plane = (blockCopy.position[0] + block.position[0]) / 2;
    const reflect = (p: V3): V3 => [2 * plane - p[0], p[1], p[2]];

    expect(plane).toBeGreaterThan(block.position[0]);
    expect(plane).toBeLessThan(servo.position[0]);
    expect(blockCopy.position.slice(1)).toEqual(block.position.slice(1));
    expect(servoCopy.componentId).toBe('feetech-sts3215');

    const want = worldPort(servo, findPort(servo, 'output')!);
    const got = worldPort(servoCopy, findPort(servoCopy, 'output')!);

    expect(gap(got.position, reflect(want.position))).toBeLessThan(0.1);

    await app.page.keyboard.press('Meta+z');
    await expect.poll(() => partCount(app.page)).toBe(2);
    expect((await record()).map((p) => p.id).sort()).toEqual(['block', 'servo']);
  });
});
