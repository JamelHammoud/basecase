import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shinFixture } from '../src/print/merge/merge.fixtures';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => { parts: Array<{ id: string; kind: string }>; project: unknown };
  bomLines: () => Array<{ key: string; qty: number }>;
}

const FIXTURE = shinFixture();
const SCREW_LINE = 'hardware:socket_head|M3|10';

const screws = () =>
  app.page.evaluate(
    (key) =>
      (window as unknown as { __studio: Studio }).__studio.bomLines().find((l) => l.key.startsWith(key))?.qty ?? 0,
    SCREW_LINE,
  );

const kindOf = (id: string) =>
  app.page.evaluate(
    (partId) =>
      (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts.find((p) => p.id === partId)?.kind ??
      null,
    id,
  );

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('merge parts', () => {
  it('merges the bracket and foot plate from Print mode, and undo brings both back', async () => {
    await app.page.evaluate((parts) => {
      const s = (window as unknown as { __studio: Studio }).__studio;

      s.load({ parts, project: s.sceneRecord().project });
    }, FIXTURE);
    await expect.poll(() => partCount(app.page)).toBe(FIXTURE.length);
    expect(await screws()).toBe(8);

    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+p');
    await expect.poll(() => app.page.locator(shown('h2'), { hasText: /^Print$/ }).count()).toBe(1);

    const row = app.page.locator(shown('li'), { hasText: 'Shin Bracket and Foot Plate' });

    await expect.poll(() => row.count(), { timeout: 60000 }).toBe(1);
    expect(await row.textContent()).toContain('Servo Cover stays separate so Knee Servo can go in');

    await row.getByRole('button', { name: 'Merge', exact: true }).click();

    await expect.poll(() => partCount(app.page), { timeout: 30000 }).toBe(FIXTURE.length - 9);
    expect(await kindOf('tray')).toBe('boolean');
    expect(await kindOf('plate')).toBeNull();
    expect(await screws()).toBe(4);

    await app.page.keyboard.press('Meta+z');

    await expect.poll(() => partCount(app.page)).toBe(FIXTURE.length);
    expect(await kindOf('tray')).toBe('cad_part');
    expect(await kindOf('plate')).toBe('cad_part');
    expect(await screws()).toBe(8);
    expect(app.errors).toEqual([]);
  }, 180000);
});
