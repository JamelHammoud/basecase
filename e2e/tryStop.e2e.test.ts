import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';

interface SimState {
  drive: string;
  playing: boolean;
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
  it('brings Try It back after Stop Try on a paused simulation', async () => {
    await expect.poll(() => tryClock().count(), { timeout: 15000 }).toBe(0);

    const before = (await simState()).tries.length;

    await app.page.locator(shown('button[aria-label="Pause"]')).click();
    await expect.poll(async () => (await simState()).playing).toBe(false);
    await startTry();
    await button('Stop Try').click();
    await expect.poll(() => button('Try It').isEnabled()).toBe(true);
    expect(await app.page.getByText('Play the simulation to record a try.').count()).toBe(1);
    expect((await simState()).drive).toBe('off');
    expect((await simState()).tries).toHaveLength(before);
    expect(app.errors).toEqual([]);
  });
});
