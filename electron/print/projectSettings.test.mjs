import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, expect, it } from 'vitest';
import { prepareProject } from './projectFile.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-project-settings-'));
const slicer = { profiles: root };
const printer = { vendor: 'Fixture' };
const settings = {
  printer_settings_id: 'Printer',
  print_settings_id: 'Fine',
  filament_settings_id: ['PLA', 'TPU'],
  filament_colour: ['#123456', '#ABCDEF'],
  filament_type: ['PLA', 'TPU'],
  sparse_infill_density: '31%',
  nozzle_diameter: ['0.6'],
  curr_bed_type: 'Textured PEI Plate',
};

function profile(kind, name, values) {
  const dir = path.join(root, 'Fixture', kind);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ name, ...values }));
}

fs.writeFileSync(path.join(root, 'Fixture.json'), '{}');
profile('machine', 'Base', { machine_start_gcode: 'G28\nM104 S220', nozzle_diameter: ['0.4'] });
profile('machine', 'Printer', { inherits: 'Base' });
profile('process', 'Fine', { layer_height: '0.12', sparse_infill_density: '15%', curr_bed_type: 'Cool Plate' });
profile('filament', 'PLA', { nozzle_temperature: ['220'], filament_max_volumetric_speed: ['21'] });
profile('filament', 'TPU', { nozzle_temperature: ['240'], filament_max_volumetric_speed: ['3.2'] });

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it.each([
  { names: ['PLA', 'TPU'], temperatures: ['220', '240'], speeds: ['21', '3.2'] },
  { names: ['TPU', 'PLA'], temperatures: ['240', '220'], speeds: ['3.2', '21'] },
])('resolves inherited settings in filament order $names without changing model entries', async (filaments) => {
  const file = path.join(root, 'project.3mf');
  const orderedSettings = { ...settings, filament_settings_id: filaments.names, filament_type: filaments.names };
  const original = {
    '3D/3dmodel.model': strToU8('<model/>'),
    'Metadata/model_settings.config': strToU8('<config/>'),
    'Metadata/project_settings.config': strToU8(JSON.stringify(orderedSettings)),
  };

  fs.writeFileSync(file, zipSync(original));
  await prepareProject(file, slicer, printer);

  const files = unzipSync(fs.readFileSync(file));
  const resolved = JSON.parse(strFromU8(files['Metadata/project_settings.config']));

  expect(files['3D/3dmodel.model']).toEqual(original['3D/3dmodel.model']);
  expect(files['Metadata/model_settings.config']).toEqual(original['Metadata/model_settings.config']);
  expect(resolved).toMatchObject({
    ...orderedSettings,
    layer_height: '0.12',
    machine_start_gcode: 'G28\nM104 S220',
    nozzle_temperature: filaments.temperatures,
    filament_max_volumetric_speed: filaments.speeds,
    different_settings_to_system: [
      'sparse_infill_density;curr_bed_type',
      'filament_colour',
      'filament_colour',
      'nozzle_diameter;printable_area;printable_height',
    ],
  });
  expect(resolved).not.toHaveProperty('inherits');

  const bytes = fs.readFileSync(file);

  await prepareProject(file, slicer, printer);
  expect(fs.readFileSync(file)).toEqual(bytes);
});

it('refuses an oversized expansion before inflating an untrusted project', async () => {
  const file = path.join(root, 'oversized.3mf');
  const bytes = zipSync({ '3D/3dmodel.model': strToU8('small') });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = 0x02014b50;

  for (let offset = 0; offset < bytes.length - 24; offset++)
    if (view.getUint32(offset, true) === signature) view.setUint32(offset + 24, 1024 * 1024 * 1024, true);

  fs.writeFileSync(file, bytes);
  await expect(prepareProject(file, slicer, printer)).rejects.toThrow('Couldn’t prepare the print project');
  expect(fs.readFileSync(file)).toEqual(Buffer.from(bytes));
});

it('refuses oversized settings and excessive filament lists without rewriting the archive', async () => {
  const file = path.join(root, 'hostile-settings.3mf');
  const configurations = [' '.repeat(1024 * 1024 + 1), JSON.stringify({ filament_settings_id: Array(17).fill('PLA') })];

  for (const configuration of configurations) {
    const bytes = zipSync({ 'Metadata/project_settings.config': strToU8(configuration) });

    fs.writeFileSync(file, bytes);
    await expect(prepareProject(file, slicer, printer)).rejects.toThrow('Couldn’t prepare the print project');
    expect(fs.readFileSync(file)).toEqual(Buffer.from(bytes));
  }
});
