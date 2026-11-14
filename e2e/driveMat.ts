import type { Page } from 'playwright-core';
import { expect } from 'vitest';
import type { SimState, Studio } from './driveStudio';
import { shown } from './harness';

async function makeReachCase(page: Page, seconds: number) {
  await page.locator(shown('button'), { hasText: 'New Case' }).first().click();

  const card = page.locator(shown('[data-testid="new-case"]'));
  const time = card.locator('label', { hasText: 'Time' }).locator('input');

  await card.locator('[role=radio]', { hasText: 'Reach a Spot' }).click();
  await time.fill(String(seconds));
  await time.press('Tab');
  await card.locator('button', { hasText: 'Make Case' }).click();
}

const countOf = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

async function expectCaseMat(page: Page) {
  await page.keyboard.press('Meta+k');
  await page.getByLabel('Search commands').fill('Export Case Mat');
  await expect.poll(() => page.getByText(/^Export Case Mat$/).count(), { timeout: 15000 }).toBe(1);
  await page.keyboard.press('Enter');

  const read = () =>
    page.evaluate(() => {
      const hooks = (window as unknown as { __studio: Studio }).__studio;

      return { file: hooks.lastDownload(), mat: hooks.caseMat() };
    });

  await expect.poll(async () => (await read()).file?.name ?? '').toMatch(/-mat\.pdf$/);

  const { file, mat } = await read();
  const pdf = Buffer.from(file!.base64, 'base64').toString('latin1');

  expect(mat).not.toBeNull();
  expect(countOf(pdf, /\/Type \/Page\b/g)).toBe(mat!.sheets + 1);
  expect(countOf(pdf, /\/Subtype \/Form\b/g)).toBe(mat!.tags + 1);
}

export async function expectRealTry(page: Page) {
  const simState = () =>
    page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState() as SimState);
  const realTries = async () => (await simState()).tries.filter((t) => t.real);

  await makeReachCase(page, 4);
  await expect.poll(async () => (await simState()).activeCase).toMatch(/^reach-a-spot/);
  await expectCaseMat(page);

  await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.feedMatFrames());
  await page.locator(shown('button'), { hasText: 'Try on Real Robot' }).first().click();
  await expect.poll(async () => (await realTries()).length, { timeout: 60000 }).toBe(1);
  expect((await realTries())[0].passed).toBe(true);
  await expect.poll(() => page.locator(shown('[data-testid="try-real"]')).count()).toBe(1);
}
