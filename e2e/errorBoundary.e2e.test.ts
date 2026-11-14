import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

const crash = (region: string | null) =>
  app.page.evaluate(
    (name) => (window as unknown as { __crashRegion: (r: string | null) => void }).__crashRegion(name),
    region,
  );

const fallback = (region: string) => app.page.locator(shown(`[data-testid="region-error"][data-region="${region}"]`));

const visibleCount = (selector: string) => app.page.locator(shown(selector)).count();

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('a region that fails to render', () => {
  it('shows its fallback in place while the rest of the app stays mounted, and reloads on its own', async () => {
    const search = 'input[aria-label="Search parts"]';

    await expect.poll(() => visibleCount(search)).toBe(1);
    await crash('Parts');

    await expect.poll(() => fallback('Parts').count()).toBe(1);
    expect(await fallback('Parts').textContent()).toContain('Parts stopped working');
    expect(await visibleCount(search)).toBe(0);
    expect(await visibleCount('nav[aria-label="Sidebar views"]')).toBe(1);
    expect(await visibleCount('main canvas')).toBeGreaterThan(0);
    expect(await visibleCount('[role="tab"]:text-is("Inspect")')).toBe(1);
    expect(await partCount(app.page)).toBe(0);
    expect(app.errors.some((e) => e.includes('Parts stopped working'))).toBe(true);

    await crash(null);
    await fallback('Parts').getByRole('button', { name: 'Reload' }).click();

    await expect.poll(() => fallback('Parts').count()).toBe(0);
    await expect.poll(() => visibleCount(search)).toBe(1);
  });

  it('keeps the side panels when the canvas fails', async () => {
    await crash('Canvas');

    await expect.poll(() => fallback('Canvas').count()).toBe(1);
    expect(await visibleCount('main canvas')).toBe(0);
    expect(await visibleCount('input[aria-label="Search parts"]')).toBe(1);
    expect(await visibleCount('[role="tab"]:text-is("Inspect")')).toBe(1);

    await crash(null);
    await fallback('Canvas').getByRole('button', { name: 'Reload' }).click();

    await expect.poll(() => visibleCount('main canvas')).toBeGreaterThan(0);
  });
});
