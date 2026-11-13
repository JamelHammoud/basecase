import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { V3 } from '../src/agent/agentFrame';
import { applySpec } from '../src/agent/agentScene';
import { portOf, servoWithPortNear, snapBracket } from '../src/agent/fixtures/snapBracket';
import { planMate } from '../src/agent/mate';
import type { PartMate } from '../src/types/ports';
import type { ScenePart } from '../src/types/robotics';
import { openApp, type App } from './harness';

type Pose = { position: V3; rotation: V3 };

type Studio = {
  load: (record: unknown) => void;
  parts: () => unknown[];
  dragPart: (id: string, to: V3, free?: boolean) => boolean;
  mates: (id: string) => PartMate[];
  pose: (id: string) => Pose | undefined;
};

type Win = { __studio: Studio };

let app: App;

const pose = (id: string) => app.page.evaluate((part) => (window as unknown as Win).__studio.pose(part)!, id);

const mates = (id: string) => app.page.evaluate((part) => (window as unknown as Win).__studio.mates(part), id);

const drag = (id: string, to: V3, free = false) =>
  app.page.evaluate(([part, at, loose]) => (window as unknown as Win).__studio.dragPart(part, at, loose), [
    id,
    to,
    free,
  ] as const);

const frames = () =>
  app.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

const expectNear = (a: V3, b: V3, tolerance = 0.1) =>
  a.forEach((v, k) => expect(Math.abs(v - b[k])).toBeLessThanOrEqual(tolerance));

const bracket = snapBracket();
const servo = servoWithPortNear('horn', bracket, 'horn', [40, -30, 0]);
const near = servoWithPortNear('horn', bracket, 'horn', [2, -3, 1]).position;

function agentPlan(): ScenePart {
  const dragged = { ...servo, position: near };
  const plan = planMate([bracket, dragged], {
    part: 'servo',
    port: 'horn',
    target: 'bracket',
    targetPort: 'horn',
    type: 'fastened',
  });

  if (typeof plan === 'string' || plan.op.op !== 'update') throw new Error('no plan');

  return applySpec(dragged, plan.op.part);
}

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate((record) => (window as unknown as Win).__studio.load(record), {
    name: 'Snap',
    parts: [bracket, servo],
  });
  await expect.poll(() => app.page.evaluate(() => (window as unknown as Win).__studio.parts().length)).toBe(2);
  await frames();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('snapping by mounting ports', () => {
  it('snaps a dragged STS3215 onto a bracket’s horn pattern, where the agent’s mate puts it', async () => {
    expect(await drag('servo', near)).toBe(true);

    const placed = await pose('servo');
    const want = agentPlan();

    expectNear(placed.position, want.position);
    expectNear(placed.rotation, want.rotation);
    expect(await mates('servo')).toEqual([{ port: 'horn', target: 'bracket', targetPort: 'horn', type: 'fastened' }]);
  });

  it('keeps the servo on the bracket when the bracket moves', async () => {
    const before = await pose('bracket');
    const to: V3 = [before.position[0] + 50, before.position[1] + 20, before.position[2] - 30];

    expect(await drag('bracket', to, true)).toBe(false);
    await expect.poll(async () => Math.abs((await pose('bracket')).position[0] - to[0])).toBeLessThanOrEqual(0.25);

    const moved = { ...bracket, ...(await pose('bracket')) };
    const followed = { ...servo, ...(await pose('servo')) };

    expectNear(portOf(followed, 'horn').position, portOf(moved, 'horn').position);
    expect(await mates('servo')).toHaveLength(1);
  });

  it('undo puts the bracket back, then takes the snap and its mate back', async () => {
    await app.page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await pose('bracket')).position).toEqual(bracket.position);
    expectNear((await pose('servo')).position, agentPlan().position);

    await app.page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => mates('servo')).toEqual([]);
    expectNear((await pose('servo')).position, servo.position);
  });

  it('moves freely without snapping while ⌘ is held', async () => {
    expect(await drag('servo', near, true)).toBe(false);
    expectNear((await pose('servo')).position, near, 0.25);
    expect(await mates('servo')).toEqual([]);
  });
});
