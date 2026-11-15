import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { openApp, shown, type App } from './harness';

interface BuildAlongStudio {
  load: (record: { name: string; parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => { project: ProjectSettings };
}

let app: App;

const part = (id: string, y: number, height: number, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y + height / 2, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height, depth: 40 },
  color: '#d8d8d8',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const servo = (id: string, y: number) =>
  part(id, y, 40, {
    name: 'Feetech STS3215',
    kind: 'component',
    category: 'actuators',
    componentId: 'feetech-sts3215',
    componentVariant: 'c001',
    color: '#222222',
  });

beforeEach(async () => {
  app = await openApp();
}, 120000);

afterEach(async () => {
  await app?.close();
});

describe('Buy All', () => {
  const opened = () => app.page.evaluate(() => (window as unknown as { opened: string[] }).opened);

  it('fills the Amazon cart from the bill of materials, from ⌘K and the list’s menu', async () => {
    const arm = Array.from({ length: 6 }, (_, i) => ({ ...servo(`buy${i}`, i * 40), componentVariant: undefined }));

    await app.page.evaluate((list) => {
      const s = (window as unknown as { __studio: BuildAlongStudio }).__studio;
      const urls: string[] = [];

      s.load({ name: 'Arm', parts: list, project: s.sceneRecord().project });
      (window as unknown as { opened: string[] }).opened = urls;
      window.open = (url) => (urls.push(String(url)), null);
    }, arm);
    await app.page.keyboard.press('Meta+k');
    await app.page.getByLabel('Search commands').fill('Buy All');
    await expect.poll(() => app.page.getByText(/^Buy All$/).count(), { timeout: 15000 }).toBe(1);
    await app.page.keyboard.press('Enter');
    await expect.poll(async () => (await opened()).length).toBe(1);

    const cart = new URL((await opened())[0]);

    expect(`${cart.origin}${cart.pathname}`).toBe('https://www.amazon.com/gp/aws/cart/add.html');
    expect(cart.searchParams.get('ASIN.1')).toBe('B0G39SM9HZ');
    expect(cart.searchParams.get('Quantity.1')).toBe('6');

    await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();
    await app.page.locator(shown('button[aria-label="Export bill of materials"]')).click();
    await app.page.getByRole('menuitem', { name: /^Buy All/ }).click();
    await expect.poll(opened).toEqual([cart.href, cart.href]);
    expect(app.errors).toEqual([]);
  }, 90000);
});
