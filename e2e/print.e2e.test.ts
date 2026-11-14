import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { labelFixture } from '../src/print/labels/label.fixtures';
import { openApp, partCount, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => {
    parts: Array<{ id: string; kind: string; position: number[]; rotation: number[]; print?: unknown }>;
    project: unknown;
  };
  printPlates: () => { open: boolean; fitTest: boolean; plates: string[][] };
  plateFiles: () => Promise<Record<string, string>>;
  labelNotes: () => Record<string, string>;
}

interface PlateMesh {
  triangles: number;
  volume: number;
  xml: string;
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

function meshOf(xml: string): PlateMesh {
  const v = [...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((m) => m.slice(1, 4).map(Number));
  const t = [...xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map((m) => m.slice(1, 4).map(Number));
  const volume = t.reduce((sum, [a, b, c]) => {
    const [p, q, r] = [v[a], v[b], v[c]];

    return (
      sum +
      (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6
    );
  }, 0);

  return { triangles: t.length, volume, xml };
}

async function plateMeshes(): Promise<Record<string, PlateMesh>> {
  const files = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.plateFiles());
  const objects = Object.values(files).flatMap((b64) =>
    strFromU8(unzipSync(Buffer.from(b64, 'base64'))['3D/3dmodel.model'])
      .split('<object ')
      .slice(1),
  );

  return Object.fromEntries(objects.map((o) => [/name="([^"]+)"/.exec(o)![1], meshOf(o)]));
}

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

describe('part labels', () => {
  const LABEL_FIXTURE = labelFixture();

  it('debosses the guide letter into the tray’s hidden floor, and Label parts off writes plain meshes', async () => {
    await app.page.evaluate((parts) => {
      const studio = (window as unknown as { __studio: Studio }).__studio;

      studio.load({ parts, project: studio.sceneRecord().project });
    }, LABEL_FIXTURE);
    await expect.poll(() => partCount(app.page)).toBe(LABEL_FIXTURE.length);
    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+p');
    await expect.poll(async () => (await printPlates()).plates.flat().length, { timeout: 60000 }).toBe(5);

    const labelSwitch = app.page.locator(visible('[role=switch][aria-label="Label parts"]'));

    expect(await labelSwitch.getAttribute('aria-checked')).toBe('true');

    const labeled = await plateMeshes();
    const notedParts = async () =>
      Object.keys(
        await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.labelNotes()),
      ).sort();

    await expect.poll(notedParts).toEqual(['bracket-left', 'bracket-right', 'lid', 'tag']);
    await app.page.locator(visible('button'), { hasText: /^Parts/ }).click();
    await expect
      .poll(() => app.page.locator(visible('li'), { hasText: 'Spare Tag' }).textContent())
      .toMatch(/Letter [A-Z]+ left off: no flat face is hidden, free and big enough/);

    await labelSwitch.click();
    await expect.poll(() => labelSwitch.getAttribute('aria-checked')).toBe('false');

    const plain = await plateMeshes();
    const changed = Object.keys(plain).filter((name) => labeled[name].xml !== plain[name].xml);

    expect(changed).toEqual(['Body Tray']);

    for (const name of changed) {
      expect(labeled[name].triangles).toBeGreaterThan(plain[name].triangles);
      expect(labeled[name].volume).toBeLessThan(plain[name].volume - 1);
    }

    for (const part of LABEL_FIXTURE.filter((p) => ['tray', 'lid', 'tag'].includes(p.id)))
      expect(plain[part.name].triangles).toBe(part.cad!.positions.length / 9);

    await app.page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  }, 180000);
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
