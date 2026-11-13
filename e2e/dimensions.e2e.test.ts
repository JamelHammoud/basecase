import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bracketAndServo, tunedAnswer } from '../src/agent/fixtures/tunedBracket';
import type { ScenePart } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

type Studio = {
  load: (r: unknown) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => { parts: ScenePart[] };
};

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const placed = () =>
  app.page.evaluate(() => {
    const { parts } = (window as unknown as { __studio: Studio }).__studio.sceneRecord();
    const at = (id: string) => parts.find((p) => p.id === id)!;

    return { plate: at('bracket').cad!.baseSize[1], servo: at('servo').position[1] };
  });

beforeAll(async () => {
  app = await openApp({ 'cad-tune': tunedAnswer(3) });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Dimensions in the Inspector', () => {
  it('recompiles an agent-made bracket from a named dimension, moves its mated servo, and undoes both', async () => {
    const parts = bracketAndServo();

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'bracket',
      parts,
    });
    await expect.poll(() => partCount(app.page)).toBe(2);
    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.select(['bracket']));

    const wall = app.page.locator(visible('input[aria-label="wall"]')).first();

    await expect.poll(() => wall.inputValue()).toBe('2');

    const before = await placed();

    await wall.fill('3');
    await wall.press('Enter');

    await expect.poll(async () => (await placed()).plate).toBeCloseTo(3, 2);

    const after = await placed();

    expect(after.servo - before.servo).toBeCloseTo(1, 2);
    expect(app.posts.filter((p) => p.route === 'cad-tune').map((p) => p.body)).toEqual([
      { workspaceId: expect.any(String), id: 'bracket', values: { wall: 3 } },
    ]);
    await expect.poll(() => wall.inputValue()).toBe('3');

    await app.page.keyboard.press('Meta+z');

    await expect.poll(placed).toEqual(before);
    await expect.poll(() => wall.inputValue()).toBe('2');
    expect(app.errors).toEqual([]);
  });
});
