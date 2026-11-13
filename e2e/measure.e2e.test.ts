import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from './harness';

let app: App;

const visible = (name: string) => app.page.getByRole('button', { name, exact: true }).filter({ visible: true }).count();
const numberFields = () => app.page.locator('input[inputmode="decimal"]').filter({ visible: true }).count();

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('measure toolbar', () => {
  it('swaps the toolbar for Ruler, Human and Dog, and Done brings it back', async () => {
    await app.page.keyboard.press('d');
    await expect.poll(() => visible('Ruler')).toBe(1);
    expect(await visible('Shapes')).toBe(0);

    const fieldsBefore = await numberFields();

    await app.page.getByRole('button', { name: 'Human', exact: true }).click();

    const box = (await app.page.locator('canvas:not([inert] *):visible').first().boundingBox())!;
    const floor = { x: box.x + box.width / 2, y: box.y + box.height * 0.7 };

    await app.page.mouse.move(floor.x - 20, floor.y);
    await app.page.mouse.move(floor.x, floor.y, { steps: 4 });
    await app.page.mouse.click(floor.x, floor.y);
    await expect.poll(numberFields).toBeGreaterThan(fieldsBefore);

    await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect.poll(() => visible('Ruler')).toBe(0);
    expect(await visible('Shapes')).toBe(1);
  });

  it('leaves Measure with Esc when nothing is measured', async () => {
    await app.page.keyboard.press('d');
    await expect.poll(() => visible('Ruler')).toBe(1);

    await app.page.keyboard.press('Escape');
    await expect.poll(() => visible('Ruler')).toBe(0);
    expect(app.errors).toEqual([]);
  });
});
