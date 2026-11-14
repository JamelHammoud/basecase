import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, openPlayTab, type App } from '../../e2e/harness';
import { plantFaults, TARGETS } from './faults';

let app: App;

const ROW = '[data-testid="peak-row"]';

beforeAll(async () => {
  app = await openApp({ scenes: [] });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('planted label faults', () => {
  it('relabel a control React redraws every frame without unmounting the app', async () => {
    const { page } = app;

    await openPlayTab(page, 'Cases');
    await expect.poll(() => page.locator(ROW).count(), { timeout: 60000 }).toBeGreaterThan(1);

    const names = await page.evaluate(
      ({ row, selector }) =>
        [...document.querySelectorAll(row)]
          .map((el) => (el.matches(selector) ? el : el.querySelector(selector)))
          .filter((el): el is Element => !!el)
          .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim())
          .slice(0, 2),
      { row: ROW, selector: TARGETS },
    );

    expect(names).toHaveLength(2);
    await plantFaults(page, [
      { kind: 'misleading-label', name: names[0] },
      { kind: 'label-removed', name: names[1] },
    ]);
    await sleep(3000);

    expect(await page.evaluate(() => document.getElementById('root')?.childElementCount ?? 0)).toBeGreaterThan(0);
    expect(await page.locator(ROW, { hasText: 'Delete Everything' }).count()).toBe(1);
  });
});
