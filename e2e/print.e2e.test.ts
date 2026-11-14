import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => {
    parts: Array<{ id: string; kind: string; position: number[]; rotation: number[]; print?: unknown }>;
    project: unknown;
  };
  printPlates: () => { open: boolean; fitTest: boolean; plates: string[][] };
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

const ROBOT = [
  printed('base', [0, 300, 0], { width: 140, height: 120, depth: 140 }),
  printed('front-leg', [0, 220, 0], { width: 150, height: 40, depth: 150 }),
  printed('back-leg', [0, 180, 0], { width: 150, height: 40, depth: 150 }),
];

const FOUND = [
  { name: 'Voron A', host: '127.0.0.1:7125', kind: 'moonraker', modelId: 'prusa-core-one' },
  { name: 'Voron B', host: '127.0.0.1:7126', kind: 'moonraker', modelId: 'prusa-mk4s' },
];

interface BuildStudio extends Studio {
  markPlatePrinted: (plate: number) => void;
  readySteps: () => boolean[];
}

const readySteps = () =>
  app.page.evaluate(() => (window as unknown as { __studio: BuildStudio }).__studio.readySteps());

async function stubPrinters() {
  await app.page.route('**/api/bridge/print-save-printers', (route) =>
    route.fulfill({ json: (route.request().postDataJSON() as { arg: unknown }).arg }),
  );
  await app.page.route('**/api/bridge/print-discover', (route) => route.fulfill({ json: FOUND }));
  await app.page.route('**/api/bridge/print-printer-status', (route) => route.fulfill({ json: { state: 'idle' } }));
  await app.page.route('**/api/bridge/print-slice', (route) =>
    route.fulfill({ json: { slicer: { name: 'OrcaSlicer', version: null }, slicedAt: '', plates: [] } }),
  );
  await app.page.route('**/api/bridge/print-send', (route) =>
    route.fulfill({ json: { started: true, message: 'Started' } }),
  );
}

async function addFoundPrinters() {
  await app.page.keyboard.press('Meta+,');

  const settings = app.page.getByRole('dialog', { name: 'Settings' });

  await settings.getByRole('navigation').getByRole('button', { name: 'Printers' }).click();
  await settings.getByRole('button', { name: 'Find on Network' }).click();
  await expect.poll(() => settings.getByRole('button', { name: 'Add', exact: true }).count()).toBe(FOUND.length);

  for (const found of FOUND) {
    const before = await settings.getByText(found.name, { exact: true }).count();

    await settings.getByRole('button', { name: 'Add', exact: true }).nth(FOUND.indexOf(found)).click();
    await expect.poll(() => settings.getByText(found.name, { exact: true }).count()).toBe(before + 1);
  }

  await app.page.keyboard.press('Escape');
  await expect.poll(() => settings.count()).toBe(0);
}

describe('printing in build order on every printer', () => {
  it('puts the base on plate 1 and gives two idle printers different plates with Start Next', async () => {
    await stubPrinters();
    await app.page.evaluate((parts) => {
      const studio = (window as unknown as { __studio: Studio }).__studio;

      studio.load({ parts, project: studio.sceneRecord().project });
    }, ROBOT);
    await expect.poll(() => partCount(app.page)).toBe(ROBOT.length);
    await addFoundPrinters();

    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+p');
    await expect
      .poll(async () => (await printPlates()).plates, { timeout: 30000 })
      .toEqual([['base'], ['front-leg'], ['back-leg']]);

    for (const [i, found] of FOUND.entries()) {
      await app.page
        .locator(visible('[data-printer]'), { hasText: found.name })
        .getByRole('button', { name: 'Start Next' })
        .click();
      await app.page.getByRole('button', { name: 'Start Print' }).click();
      await expect.poll(() => app.posts.filter((p) => p.route === 'print-send').length).toBe(i + 1);
    }

    const sends = app.posts
      .filter((p) => p.route === 'print-send')
      .map((p) => (p.body as { arg: { plate: number; printerId: string } }).arg);

    expect(sends.map((s) => s.plate)).toEqual([1, 2]);
    expect(new Set(sends.map((s) => s.printerId)).size).toBe(2);
    expect(await readySteps()).not.toContain(true);

    await app.page.evaluate(() => (window as unknown as { __studio: BuildStudio }).__studio.markPlatePrinted(1));
    await expect.poll(async () => (await readySteps())[0]).toBe(true);
    expect((await readySteps()).slice(1)).not.toContain(true);

    await app.page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  }, 120000);
});
