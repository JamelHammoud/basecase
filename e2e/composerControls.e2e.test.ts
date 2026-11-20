import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';

let app: App;

beforeAll(async () => {
  app = await openApp();
});

afterAll(async () => {
  await app?.close();
});

it('centers the larger Stop glyph in the same composer button as Send and cancels the turn', async () => {
  const { page } = app;
  let finish = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });

  await page.route('**/api/bridge/acp-prompt', async (route) => {
    await pending;
    await route.fulfill({ json: {} });
  });
  await page.locator(shown('[role=tab]'), { hasText: 'Agent' }).first().click();

  const draft = page.locator(shown('textarea')).last();
  const send = page.getByRole('button', { name: 'Send', exact: true });

  await draft.fill('Check this robot');

  const sendBounds = await send.boundingBox();

  await send.click();

  try {
    const stop = page.getByRole('button', { name: 'Stop', exact: true });

    await stop.waitFor();

    const button = await stop.boundingBox();
    const icon = await stop.locator('svg').boundingBox();

    expect(button?.width).toBe(32);
    expect(button?.height).toBe(32);
    expect(button?.x).toBeCloseTo(sendBounds!.x, 0);
    expect(button?.y).toBeCloseTo(sendBounds!.y, 0);
    expect(icon?.width).toBe(20);
    expect(icon?.height).toBe(20);
    expect(icon!.x + icon!.width / 2).toBeCloseTo(button!.x + button!.width / 2, 1);
    expect(icon!.y + icon!.height / 2).toBeCloseTo(button!.y + button!.height / 2, 1);
    await stop.click();
    await expect.poll(() => app.posts.some((post) => post.route === 'acp-cancel')).toBe(true);
  } finally {
    finish();
  }
});
