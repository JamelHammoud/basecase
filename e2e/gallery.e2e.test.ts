import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { exposeTestHooks, launchChrome, shown } from './harness';
import { ARENA_LINE, stubHoldPose, stubTabGpu } from './holdPose';

let browser: Browser;
const base = inject('webUrl');

interface GalleryState {
  status: string;
  drive: string;
  note: string | null;
  stats: { rtf: number; robots: Array<{ forward: number; fellAt: number | null }> } | null;
  controller: string;
  skill: { hash: string; steps: number } | null;
}

const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gallery?: { state: () => GalleryState } }).__gallery?.state() ?? null);

async function open(path: string, viewport = { width: 1440, height: 900 }, gpu = false) {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];

  await exposeTestHooks(page);

  if (gpu) await page.addInitScript(stubTabGpu);

  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${base}${path}`);

  return { page, errors };
}

beforeAll(async () => {
  browser = await launchChrome();
}, 120000);

afterAll(async () => {
  await browser?.close();
});

describe('gallery links', () => {
  it('drive a rover in the browser, at real time, under the web demo', async () => {
    const { page, errors } = await open('/c/rover-reach-the-flag');
    const card = page.getByTestId('gallery-card');

    await expect.poll(() => card.count(), { timeout: 60000 }).toBe(1);
    expect(await card.innerText()).not.toContain('simulation only');
    expect(await card.getByRole('button', { name: 'Train' }).count()).toBe(0);
    await expect.poll(async () => (await state(page))?.status, { timeout: 60000 }).toBe('ready');

    await card.getByRole('button', { name: 'Drive', exact: true }).click();
    await expect.poll(async () => (await state(page))?.drive, { timeout: 30000 }).toBe('on');
    await page.mouse.click(900, 450);
    await page.keyboard.down('w');
    await expect
      .poll(async () => (await state(page))?.stats?.robots[0].forward ?? 0, { timeout: 20000 })
      .toBeGreaterThan(0.1);
    await page.keyboard.up('w');

    const after = await state(page);

    expect(after?.stats?.rtf ?? 0).toBeGreaterThan(0.9);
    expect(errors).toEqual([]);
    await page.close();
  }, 240000);

  it('opens the scene in the studio from Open Scene', async () => {
    const { page } = await open('/c/arm-touch-the-dots');

    await expect.poll(() => page.getByTestId('gallery-card').count(), { timeout: 60000 }).toBe(1);
    await page.getByRole('button', { name: 'Open Scene' }).click();
    await page.waitForURL(`${base}/`);
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
      timeout: 60000,
    });
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __studio: { parts: () => unknown[] } }).__studio.parts().length),
      )
      .toBe(10);
    await page.close();
  }, 180000);

  it('teaches the hexapod to stand from its card, runs the skill, and carries it into the studio', async () => {
    const { page, errors } = await open('/c/hexapod-reach-the-flag', undefined, true);
    const card = page.getByTestId('gallery-card');
    const cardStand = card.getByTestId('skill-row').filter({ hasText: 'Stand' });

    await expect.poll(async () => (await state(page))?.status, { timeout: 60000 }).toBe('ready');
    await page.evaluate(stubHoldPose, '__gallery' as const);
    await card.getByRole('button', { name: 'Train', exact: true }).click();
    await expect.poll(() => cardStand.count(), { timeout: 60000 }).toBe(1);
    await expect.poll(() => cardStand.innerText(), { timeout: 180000 }).toMatch(ARENA_LINE);
    await expect.poll(async () => (await state(page))?.controller, { timeout: 30000 }).toBe('policy');
    expect((await state(page))?.skill?.steps).toBe(1);

    await card.getByRole('button', { name: 'Open Scene' }).click();
    await page.waitForURL(`${base}/`);
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
      timeout: 60000,
    });
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();

    const studioStand = page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

    await expect.poll(() => studioStand.innerText(), { timeout: 60000 }).toMatch(ARENA_LINE);
    expect(errors).toEqual([]);
    await page.close();
  }, 360000);

  it('keeps the landing page on phones, and says plainly when a link is wrong', async () => {
    const phone = await open('/c/rover-reach-the-flag', { width: 390, height: 844 });

    await expect.poll(() => phone.page.getByText('Build real robots').count(), { timeout: 30000 }).toBeGreaterThan(0);
    expect(await phone.page.getByTestId('gallery-card').count()).toBe(0);
    await phone.page.close();

    const missing = await open('/c/no-such-case');

    await expect.poll(() => missing.page.getByText('No Case here').count(), { timeout: 30000 }).toBe(1);
    await missing.page.close();
  }, 120000);
});
