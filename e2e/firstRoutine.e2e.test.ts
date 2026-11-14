import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { galleryBundles } from '../src/gallery/galleryEntries';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

interface Studio {
  routineState: () => { routine: { id: string } | null };
}

const rover = galleryBundles().find((b) => b.slug === 'rover-reach-the-flag')!;

let app: App;

const routineId = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.routineState().routine?.id ?? null);

const crash = (region: string | null) =>
  app.page.evaluate(
    (name) => (window as unknown as { __crashRegion: (r: string | null) => void }).__crashRegion(name),
    region,
  );

const fallback = () => app.page.locator(shown('[data-testid="region-error"][data-region="Routines"]'));

const flowCount = () => app.page.locator(shown('[data-testid="routine-flow"]')).count();

const unexpected = () => app.errors.filter((e) => !e.includes('Test crash in Routines'));

beforeAll(async () => {
  app = await openApp({ scenes: [] });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Routines on the first-launch rover', () => {
  it('opens a new Routine from the empty state', async () => {
    const { page } = app;

    await expect.poll(() => partCount(page), { timeout: 30000 }).toBe(rover.robot.parts.length);
    await openPlayTab(page, 'Routines');
    await page.locator(shown('button'), { hasText: 'New Routine' }).first().click();

    await expect.poll(flowCount).toBe(1);
    await expect.poll(routineId).not.toBeNull();
    expect(await fallback().count()).toBe(0);
    expect(app.errors).toEqual([]);
  });

  it('reloads the Routines tab back to its Routine once the failure is gone', async () => {
    const id = await routineId();

    await crash('Routines');
    await expect.poll(() => fallback().count()).toBe(1);
    expect(await flowCount()).toBe(0);

    await fallback().getByRole('button', { name: 'Reload' }).click();
    await expect.poll(() => fallback().count()).toBe(1);

    await crash(null);
    await fallback().getByRole('button', { name: 'Reload' }).click();

    await expect.poll(() => fallback().count()).toBe(0);
    await expect.poll(flowCount).toBe(1);
    expect(await routineId()).toBe(id);
    expect(unexpected()).toEqual([]);
  });
});
