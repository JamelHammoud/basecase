import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, type App } from './harness';

const anyPartMesh = () => readdirSync('public/parts').find((f) => f.endsWith('.glb'))!;

const SOURCED = {
  id: 'e2e-sourced-board',
  kind: 'part',
  name: 'Sourced Test Board',
  maker: 'Test Maker',
  mpn: 'TB-1',
  spec: 'A board the agent found',
  url: 'https://maker.example/tb-1',
  group: 'Drivers',
  sources: [{ claim: 'Size', url: 'https://maker.example/tb-1.pdf' }],
  addedAt: '2026-11-07',
  link: { status: 'confirmed', checkedAt: '2026-11-07' },
  mesh: { size: [30, 10, 20], triangles: 100, source: 'manufacturer', cadUrl: '', license: '', ports: [] },
};

let app: App;

beforeAll(async () => {
  app = await openApp({
    'sourced-parts': [SOURCED],
    'sourced-mesh': { data: readFileSync(`public/parts/${anyPartMesh()}`).toString('base64') },
  });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Parts the agent added', () => {
  it('are listed with a real thumbnail and can be added to the scene', async () => {
    const { page, requests } = app;

    await page
      .getByRole('button', { name: /^Added by Agent/ })
      .first()
      .click();

    const tile = page.locator('.group', { hasText: 'Sourced Test Board' }).first();

    await expect.poll(() => tile.isVisible(), { timeout: 20000 }).toBe(true);
    await expect
      .poll(
        async () =>
          (await tile
            .locator('img')
            .first()
            .getAttribute('src')
            .catch(() => '')) ?? '',
        {
          timeout: 45000,
        },
      )
      .toMatch(/^data:image/);

    expect(requests.some((url) => url.includes('/sourced-mesh'))).toBe(true);
    expect(requests.filter((url) => url.includes('parts/e2e-sourced-board.glb'))).toEqual([]);

    const before = await partCount(page);
    const add = tile.getByRole('button', { name: 'Add' });
    const pointerEvents = () => add.evaluate((el) => getComputedStyle(el).pointerEvents);

    await page.mouse.move(0, 0);
    await expect.poll(pointerEvents).toBe('none');

    await tile.hover();
    await expect.poll(pointerEvents).toBe('auto');
    await add.click();
    await expect.poll(() => partCount(page), { timeout: 20000 }).toBe(before + 1);
  }, 120000);

  it('are found by search and marked', async () => {
    const { page } = app;
    const field = page.getByRole('textbox', { name: /^Search parts/ }).first();

    await field.fill('sourced test');

    await expect
      .poll(() => page.locator('[data-result="0"]').textContent(), { timeout: 10000 })
      .toContain('Added by Agent');

    const row = page.locator('[data-result="0"]');
    const nameWidth = () => row.getByText('Sourced Test Board').evaluate((el) => el.getBoundingClientRect().width);
    const rowWidth = await row.evaluate((el) => el.getBoundingClientRect().width);

    expect(await nameWidth()).toBeGreaterThan(rowWidth - 80);
  }, 30000);
});
