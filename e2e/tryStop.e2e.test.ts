import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';

interface SimState {
  drive: string;
  tries: Array<{ id: string; seconds: number }>;
}

let app: App;

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: { simState: () => SimState } }).__studio.simState());

const button = (name: string) => app.page.locator(shown('button'), { hasText: name }).first();

const tryClock = () => app.page.locator(shown('[data-testid="try-clock"]'));

async function startTry() {
  await expect.poll(() => button('Try It').isEnabled(), { timeout: 30000 }).toBe(true);
  await button('Try It').click();
  await expect.poll(() => tryClock().count(), { timeout: 60000 }).toBe(1);
}

beforeAll(async () => {
  app = await openApp({ scenes: [] });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('stopping a try on the first launch rover', () => {
  it('ends the try at once from the canvas’s Stop Driving', async () => {
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    await startTry();

    const stop = await app.page
      .getByText(/^(Esc)?Stop Driving$/)
      .last()
      .boundingBox();

    await app.page.mouse.click(stop!.x + stop!.width / 2, stop!.y + stop!.height / 2);
    await expect.poll(() => tryClock().count(), { timeout: 3000 }).toBe(0);
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
    expect((await simState()).tries[0].seconds).toBeLessThan(6);
    await expect.poll(() => button('Try It').isEnabled()).toBe(true);
    expect(app.errors).toEqual([]);
  });
});
