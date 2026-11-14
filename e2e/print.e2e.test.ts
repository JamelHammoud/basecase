import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { fakeUnitUsd, startFakeSlant, type FakeSlant } from '../electron/print/services/testService.mjs';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { openApp, partCount, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => {
    parts: Array<{ id: string; kind: string; position: number[]; rotation: number[]; print?: unknown }>;
    project: unknown;
  };
  printPlates: () => { open: boolean; fitTest: boolean; plates: string[][] };
  printState: () => { madeBy: string | null };
  chooseService: () => Promise<void>;
  bomLines: () => Array<{ key: string; category: string; qty: number; lineUsd?: number; estUsd?: number }>;
}

const printed = (id: string, position: number[], dimensions: Record<string, number>) => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions,
  color: '#e4e4e7',
  note: '',
  mechanicalTag: '3D Printed PLA/PETG',
  visible: true,
  locked: false,
});

const bought = (id: string, position: number[], extra: Record<string, unknown>) => ({
  ...printed(id, position, { width: 5, height: 4, depth: 5 }),
  mechanicalTag: undefined,
  ...extra,
});

const FIT_FIXTURE = [
  printed('servo-bracket', [0, 30, 0], { width: 120, height: 60, depth: 80 }),
  printed('insert-plate', [200, 4, 0], { width: 100, height: 8, depth: 60 }),
  bought('servo', [0, 30, 0], {
    name: 'Feetech STS3215',
    kind: 'component',
    category: 'actuators',
    componentId: 'feetech-sts3215',
    componentVariant: 'c001',
    dimensions: { width: 45.2, height: 35, depth: 24.7 },
  }),
  ...[
    [170, -20],
    [170, 20],
    [230, -20],
    [230, 20],
  ].map(([x, z], i) =>
    bought(`insert-${i}`, [x, 6, z], {
      name: 'M3 Heat Insert',
      kind: 'hardware',
      category: 'hardware',
      hardware: { type: 'heat_insert', size: 'M3', length: 4 },
    }),
  ),
];

const printPlates = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates());

const sceneParts = () =>
  app.page.evaluate(() =>
    (window as unknown as { __studio: Studio }).__studio
      .sceneRecord()
      .parts.map(({ id, kind, position, rotation, print }) => ({ id, kind, position, rotation, print: print ?? null })),
  );

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('print layout', () => {
  it('counts the plates in the Build tab and lays them out in Print mode', async () => {
    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().click();
    expect(await partCount(app.page)).toBe(1);

    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

    const printing = app.page.locator(visible('section'), { hasText: /^Printing/ }).first();

    await expect.poll(() => printing.textContent(), { timeout: 20000 }).toMatch(/^Printing1 plate≈ .*minPrint$/);
    expect(await app.page.locator(visible('select[aria-label="Printer"]')).count()).toBe(0);

    await printing.getByRole('button', { name: 'Print', exact: true }).click();
    await expect.poll(() => app.page.locator(visible('h2'), { hasText: /^Print$/ }).count()).toBe(1);
    expect(await app.page.locator(visible('select[aria-label="Printer"]')).count()).toBe(1);
    expect(await app.page.locator(visible('h3'), { hasText: /^Plate 1$/ }).count()).toBe(1);
    expect(await app.page.locator(visible('button[aria-expanded="false"]'), { hasText: /^Parts/ }).textContent()).toBe(
      'Parts1',
    );
    expect(await app.page.getByRole('button', { name: /^Send Plate/ }).count()).toBe(0);

    await app.page.locator(visible('button'), { hasText: /^Add Printer$/ }).click();
    await expect
      .poll(() => app.page.locator(visible('[role=dialog][aria-label=Settings] h3')).textContent())
      .toBe('Printers');
    await app.page
      .locator('[role=dialog][aria-label=Settings]')
      .getByRole('button', { name: /^Close/ })
      .click();
    await expect.poll(() => app.page.locator(visible('[role=dialog][aria-label=Settings]')).count()).toBe(0);

    await app.page.getByRole('button', { name: 'Done' }).click();
    await expect.poll(() => app.page.locator(visible('h2'), { hasText: /^Print$/ }).count()).toBe(0);
  });

  it('opens the plates with ⌘P, shows the Print panel, and closes with Esc', async () => {
    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+p');
    await expect.poll(() => app.page.locator(visible('h2'), { hasText: /^Print$/ }).count()).toBe(1);
    await expect.poll(() => app.page.locator(visible('canvas')).count()).toBeGreaterThan(0);
    await expect.poll(() => app.page.locator(visible('h3'), { hasText: /^Plate 1$/ }).count()).toBe(1);
    expect(await app.page.locator(visible('h3'), { hasText: /^Plates$/ }).count()).toBe(0);
    expect(await app.page.getByRole('button', { name: 'Close plates' }).count()).toBe(0);

    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.locator(visible('h2'), { hasText: /^Print$/ }).count()).toBe(0);
    expect(app.errors).toEqual([]);
  });

  it('plates one coupon per fit with Print Fit Test from ⌘K, and leaves the scene as it was', async () => {
    await app.page.evaluate((parts) => {
      const studio = (window as unknown as { __studio: Studio }).__studio;

      studio.load({ parts, project: studio.sceneRecord().project });
    }, FIT_FIXTURE);
    await expect.poll(() => partCount(app.page)).toBe(FIT_FIXTURE.length);

    const before = await sceneParts();

    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Print Fit Test');
    await app.page.keyboard.press('Enter');
    await expect
      .poll(printPlates, { timeout: 60000 })
      .toEqual({ open: true, fitTest: true, plates: [['fit-test-1', 'fit-test-2']] });
    expect(await app.page.locator(visible('h2'), { hasText: /^Print Fit Test$/ }).count()).toBe(1);

    await app.page.getByRole('button', { name: 'Done' }).click();
    await expect.poll(async () => (await printPlates()).fitTest).toBe(false);
    expect((await printPlates()).open).toBe(true);
    expect(await sceneParts()).toEqual(before);

    await app.page.keyboard.press('Escape');
    await expect.poll(async () => (await printPlates()).open).toBe(false);
    expect(app.errors).toEqual([]);
  }, 120000);

  it('asks the backend for nothing it cannot answer', () => {
    expect(
      app.posts.filter((p) => p.route.startsWith('print-') && !/status|printers|last-slice/.test(p.route)),
    ).toEqual([]);
  });
});

describe('a Prusa printer', () => {
  it('lays out plates on the CORE One’s bed once it’s added in Settings ▸ Printers', async () => {
    await app.page.route('**/api/bridge/print-save-printers', (route) =>
      route.fulfill({ json: (route.request().postDataJSON() as { arg: unknown }).arg }),
    );
    await app.page.keyboard.press('Meta+,');

    const settings = app.page.getByRole('dialog', { name: 'Settings' });

    await settings.getByRole('navigation').getByRole('button', { name: 'Printers' }).click();
    await settings.getByRole('button', { name: 'Add Printer' }).click();
    await settings.locator('select[aria-label="Model"]').selectOption({ label: 'Prusa CORE One' });
    await expect.poll(() => settings.getByText('Prusa CORE One, 0.4 mm nozzle, Export only').count()).toBe(1);
    await app.page.keyboard.press('Escape');
    await expect.poll(() => settings.count()).toBe(0);

    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+p');
    await expect.poll(() => app.page.locator(visible('h2'), { hasText: /^Print$/ }).count()).toBe(1);

    const printState = () =>
      app.page.evaluate(() =>
        (
          window as unknown as {
            __studio: { printState: () => { printer: string; bed: { width: number; depth: number; height: number } } };
          }
        ).__studio.printState(),
      );

    await expect
      .poll(async () => {
        const { printer, bed } = await printState();

        return [printer, bed?.width, bed?.depth, bed?.height];
      })
      .toEqual(['prusa-core-one', 250, 220, 270]);

    await app.page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  });
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
