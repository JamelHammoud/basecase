import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';

interface SimState {
  playing: boolean;
  drive: string;
  controller: { kind: string };
  stats: { robots: Array<{ travelled: number; speed: number }> } | null;
}

let app: App;

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: { simState: () => SimState } }).__studio.simState());

const rover = async () => (await simState()).stats?.robots[0] ?? { travelled: 0, speed: 1 };

const controller = () => app.page.locator(shown('select[aria-label="Controller"]'));

beforeAll(async () => {
  app = await openApp({ scenes: [] });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Simulate controls while a Case drives the rover', () => {
  it('shows Drive in the controller, and switches to Hold pose from it', async () => {
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    expect(await controller().isEnabled()).toBe(true);
    expect(await controller().inputValue()).toBe('drive');

    await controller().selectOption('hold');

    await expect.poll(async () => (await simState()).controller.kind).toBe('hold');
    expect((await simState()).drive).toBe('off');
    expect(await controller().inputValue()).toBe('hold');
  });

  it('shoves the rover at least 10 cm with Push while it stands still', async () => {
    const { page } = app;

    if ((await simState()).drive === 'on') {
      await page.keyboard.press('Meta+k');
      await page.keyboard.type('Stop Driving');
      await page.keyboard.press('Enter');
    }

    await expect.poll(async () => (await simState()).playing).toBe(true);
    await expect.poll(async () => (await rover()).speed, { timeout: 20000 }).toBeLessThan(0.01);

    const from = (await rover()).travelled;

    await page.locator(shown('button'), { hasText: /^Push$/ }).click();
    await expect.poll(async () => (await rover()).travelled - from, { timeout: 15000 }).toBeGreaterThan(0.1);
  });
});
