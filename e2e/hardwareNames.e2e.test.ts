import { afterAll, beforeAll, expect, it } from 'vitest';
import { hardwareDimensions, makeSpec, type HardwareType } from '../src/data/hardware';
import type { ScenePart } from '../src/types/robotics';
import { openApp, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { name: string; parts: ScenePart[] }) => void;
  select: (ids: string[]) => void;
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

async function inspectHardware(type: HardwareType) {
  const hardware = makeSpec(type, { size: 'M3', length: 4 });
  const part: ScenePart = {
    id: 'hardware-name',
    name: 'Hardware',
    kind: 'hardware',
    category: 'hardware',
    role: 'solid',
    position: [0, 5, 0],
    rotation: [0, 0, 0],
    dimensions: hardwareDimensions(hardware),
    hardware,
    color: '#d4d4d4',
    note: '',
    visible: true,
    locked: false,
  };

  await app.page.evaluate((hardwarePart) => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    studio.load({ name: 'Hardware names', parts: [hardwarePart] });
    studio.select([hardwarePart.id]);
  }, part);
  await app.page.getByRole('tab', { name: 'Inspect', exact: true }).filter({ visible: true }).first().click();
}

it('keeps hardware choice groups named after their visible section titles', async () => {
  await inspectHardware('socket_head');

  for (const name of ['Head', 'Drive', 'Size', 'Finish']) {
    const group = app.page.getByRole('radiogroup', { name, exact: true }).filter({ visible: true });

    await expect.poll(() => group.count()).toBe(1);
    expect(await group.getByRole('radio', { checked: true }).count()).toBe(1);
  }

  await inspectHardware('heat_insert');

  const lengths = app.page.getByRole('radiogroup', { name: 'Length', exact: true }).filter({ visible: true });

  await expect.poll(() => lengths.count()).toBe(1);
  expect(await lengths.getByRole('radio', { checked: true }).textContent()).toBe('4 mm');
  expect(app.errors).toEqual([]);
});

it('keeps inspector fields named after the visible Notes, Manufacturing and Wall thickness captions', async () => {
  const part: ScenePart = {
    id: 'named-plate',
    name: 'Mounting Plate',
    kind: 'box',
    category: 'primitives',
    role: 'solid',
    position: [0, 1.5, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 80, height: 3, depth: 50, thickness: 2 },
    color: '#d4d4d4',
    note: 'Fit the shell before tightening.',
    visible: true,
    locked: false,
  };

  await app.page.evaluate((plate) => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    studio.load({ name: 'Inspector field names', parts: [plate] });
    studio.select([plate.id]);
  }, part);

  const notes = app.page.getByRole('textbox', { name: 'Notes', exact: true }).filter({ visible: true });
  const wall = app.page.getByRole('textbox', { name: 'Wall thickness', exact: true }).filter({ visible: true });
  const manufacturing = app.page
    .getByRole('combobox', { name: 'Manufacturing', exact: true })
    .filter({ visible: true });

  await expect.poll(() => notes.count()).toBe(1);
  expect(await notes.inputValue()).toBe(part.note);
  expect(await wall.inputValue()).toBe('2');
  await expect.poll(() => manufacturing.count()).toBe(1);
  expect(await manufacturing.inputValue()).toBe('printed');
  expect(app.errors).toEqual([]);
});
