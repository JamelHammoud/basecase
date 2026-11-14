import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { fakeUnitUsd, startFakeSlant, type FakeSlant } from '../electron/print/services/testService.mjs';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { openApp, partCount, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => { project: unknown };
  printState: () => { madeBy: string | null };
  chooseService: () => Promise<void>;
  bomLines: () => Array<{ key: string; category: string; qty: number; lineUsd?: number; estUsd?: number }>;
}

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const SERVICE_ROUTES = ['print-service', 'print-set-service-key', 'print-quote'];

const saveKey = (key: string) =>
  app.page.evaluate(
    (arg) =>
      fetch('/api/bridge/print-set-service-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arg }),
      }).then((r) => r.json()),
    key,
  );

beforeAll(async () => {
  app = await openApp({}, SERVICE_ROUTES);
  await saveKey('');
}, 120000);

afterAll(async () => {
  if (app) await saveKey('');

  await app?.close();
});

describe('Made by a Service', () => {
  const KEY = 'sl-e2e-key';
  const BUDGET_USD = 30;
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const parts = rover.parts.map((p) => (p.id === 'caster_wheel_disc' ? { ...p, print: { copies: 2 } } : p));
  const sizeOf = (id: string) => {
    const { width, height, depth } = rover.parts.find((p) => p.id === id)!.dimensions;

    return [width, height, depth] as [number, number, number];
  };
  const quotedUsd = parts.reduce((sum, p) => sum + fakeUnitUsd(sizeOf(p.id)) * (p.print?.copies ?? 1), 0);
  let service: FakeSlant;

  const bomLines = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.bomLines());
  const chooseService = () =>
    app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.chooseService());
  const madeBy = () =>
    app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printState().madeBy);
  const bom = () => app.page.locator(visible('section'), { hasText: /^Bill of materials/ }).first();
  const group = (name: string) =>
    bom().locator(visible('button[aria-expanded]'), { hasText: new RegExp(`^${name}\\d`) });
  const budgetTotal = async () => {
    const text =
      (await app.page
        .locator(visible('section'), { hasText: /^Checks/ })
        .first()
        .textContent()) ?? '';

    return Number(/BOM ≈ \D*([\d,]+) of/.exec(text)?.[1]?.replace(/,/g, '') ?? NaN);
  };

  beforeAll(async () => {
    service = await startFakeSlant({ key: KEY, port: inject('servicePort') });
  });

  afterAll(async () => {
    await service?.close();
  });

  it('asks for the service’s key in Settings ▸ Accounts before it can be chosen', async () => {
    await app.page.evaluate(
      ({ parts, budgetUsd }) => {
        const s = (window as unknown as { __studio: Studio }).__studio;

        s.load({ parts, project: { ...(s.sceneRecord().project as object), budgetUsd } });
      },
      { parts, budgetUsd: BUDGET_USD },
    );
    await expect.poll(() => partCount(app.page)).toBe(parts.length);
    await chooseService();

    const settings = app.page.getByRole('dialog', { name: 'Settings' });

    await expect.poll(() => settings.locator(visible('h3')).first().textContent()).toBe('Accounts');
    expect(await madeBy()).toBeNull();

    const key = settings.getByLabel('API key');

    await key.fill(KEY);
    await key.press('Enter');
    await expect.poll(() => key.getAttribute('placeholder')).toBe('••••••••');
    await app.page.keyboard.press('Escape');
    await expect.poll(() => settings.count()).toBe(0);
  });

  it('quotes one Printed parts line per shape and counts the quote in Budget', async () => {
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await chooseService();
    await expect.poll(madeBy).toBe('service');

    const printed = async () => (await bomLines()).filter((l) => l.category === 'Printed parts');

    await expect
      .poll(async () => (await printed()).filter((l) => l.lineUsd !== undefined).length, { timeout: 45000 })
      .toBe(4);
    expect((await printed()).reduce((sum, l) => sum + l.lineUsd!, 0)).toBeCloseTo(quotedUsd, 2);
    expect(service.state.requests.filter((r) => r.method === 'PUT')).toHaveLength(4);
    expect((await bomLines()).some((l) => l.category === 'Filament')).toBe(false);
    await expect.poll(() => group('Printed parts').textContent(), { timeout: 15000 }).toMatch(/^Printed parts4/);

    const estimated = (await bomLines())
      .filter((l) => l.category !== 'Equipment')
      .reduce((sum, l) => sum + (l.lineUsd ?? l.estUsd ?? 0), 0);

    await expect.poll(budgetTotal, { timeout: 30000 }).toBe(Math.round(estimated));
    expect(app.errors).toEqual([]);
  }, 90000);

  it('brings the Filament section back when a printer is chosen again', async () => {
    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+p');

    const select = app.page.locator(visible('select[aria-label="Printer"]'));

    await expect.poll(() => select.inputValue()).toBe('__service');
    await select.selectOption({ index: 0 });
    await expect.poll(madeBy).toBeNull();
    await app.page.keyboard.press('Escape');
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await expect.poll(() => group('Filament').count(), { timeout: 30000 }).toBe(1);
    expect(await group('Printed parts').count()).toBe(0);
    expect(app.errors).toEqual([]);
  }, 60000);
});
