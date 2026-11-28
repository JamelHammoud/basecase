import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { buildCatalog } from './catalog.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'single-tool-'));
const machineDir = path.join(root, 'Test', 'machine');

fs.mkdirSync(machineDir, { recursive: true });
fs.writeFileSync(path.join(root, 'Test.json'), '{}');
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const configurations = [
  ['single', { nozzle_diameter: ['0.4'] }, true],
  ['MMU3', { nozzle_diameter: ['0.4'] }, false],
  ['INDX', { nozzle_diameter: ['0.4'] }, false],
  ['XL 5T', { nozzle_diameter: ['0.4', '0.4', '0.4', '0.4', '0.4'] }, false],
  ['mixed', { nozzle_diameter: ['0.4', '0.6'] }, false],
  ['changer', { nozzle_diameter: ['0.4'], extruder_max_nozzle_count: ['7'] }, false],
  ['hotends', { nozzle_diameter: ['0.4'], handle_hotend_as_extruder: '1' }, false],
  ['offsets', { nozzle_diameter: ['0.4'], extruder_offset: ['0x0', '25x0'] }, false],
  ['mapping', { nozzle_diameter: ['0.4'], physical_extruder_map: ['0', '1'] }, false],
  ['extruder ids', { nozzle_diameter: ['0.4'], printer_extruder_id: ['1', '2'] }, false],
  ['capacity', { nozzle_diameter: ['0.4'], extruder_max_nozzle_count: ['bad'] }, false],
  ['other nozzle', { nozzle_diameter: ['0.6'] }, false],
];

for (const [name, settings] of configurations) {
  const write = (data) => fs.writeFileSync(path.join(machineDir, `${data.name}.json`), JSON.stringify(data));

  write({ name, type: 'machine_model', nozzle_diameter: '0.4;0.6' });
  write({ name: `${name} base`, instantiation: 'false', ...settings });
  write({
    name: `${name} 0.4 nozzle`,
    printer_model: name,
    inherits: `${name} base`,
    printable_area: ['0x0', '200x0', '200x200', '0x200'],
    printable_height: '200',
  });
}

it.each(configurations)(
  'admits %s only when its inherited tool assignments fit the model',
  (name, settings, supported) => {
    const models = buildCatalog([{ slicer: 'bambu', version: '02.09.02.62', profiles: root }]);

    expect(models.some((model) => model.name === name)).toBe(supported);
  },
);
