import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { buildCatalog, compatibleWith, renderCatalog } from './catalog.mjs';
import { profileFixture } from './profileRefresh.fixtures.mjs';
import { findPreset, flattenPresets } from '../../electron/print/slice.mjs';
import { prepareProject } from '../../electron/print/projectFile.mjs';
import { PrinterStore } from '../../electron/print/printers.mjs';
import { printerModel, resolvePrinter } from '../../src/data/printers';
import { jobPrinter } from '../../src/print/job';
import { projectJobSpec } from '../../src/print/projectJob';
import { roverPlan, roverShapes } from '../../src/print/project.fixtures';
import { threeMfIn } from '../../src/three/analysis/analysisPool';
import { DEFAULT_PROJECT } from '../../src/types/robotics';

function archiveSpec(setup, project) {
  const plan = roverPlan();

  for (const plate of plan.plates) plate.material = plate.material === 'TPU' ? 'PETG' : plate.material;

  const spec = projectJobSpec(plan, setup, project);

  if (setup.model.presets.filaments.PETG) return spec;

  spec.files[0].project.filaments = [spec.files[0].project.filaments[0]];

  for (const item of spec.files[0].items) item.filament = 1;

  return spec;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-refresh-'));
const sources = profileFixture(root);
const catalog = buildCatalog(sources);
const workflows = [
  ['bambu-lab-a1', 256, 256, 256],
  ['bambu-lab-a1-mini', 180, 180, 180],
  ['bambu-lab-p1s', 256, 256, 250],
  ['bambu-lab-x1-carbon', 256, 256, 250],
  ['prusa-core-one', 250, 220, 270],
  ['prusa-core-one-l', 300, 300, 331],
  ['prusa-mk4s', 250, 210, 220],
  ['prusa-mini-is', 180, 180, 180],
  ['prusa-xl', 360, 360, 360],
  ['prusa-mini', 180, 180, 180],
];

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('regenerates the bounded upstream trees deterministically and keeps Bambu precedence', () => {
  expect(renderCatalog(buildCatalog(sources))).toBe(renderCatalog(catalog));
  expect(catalog.find((m) => m.id === 'prusa-mini').source.slicer).toBe('bambu');
  expect(catalog.filter((m) => /MMU|INDX|\dT|H2D|H3C|P3C/.test(m.name))).toEqual([]);
});

it.each(workflows)(
  'prepares %s with compatible presets, saved identity and matching archive settings',
  async (id, w, d, h) => {
    const model = catalog.find((m) => m.id === id);
    const bundled = printerModel(id);
    const source = sources.find((s) => s.slicer === model.source.slicer);
    const slicer = { profiles: source.profiles };
    const machine = findPreset(source.profiles, 'machine', model.presets.machine, model.vendor);
    const store = new PrinterStore(path.join(root, id), { get: () => '', set: () => undefined });
    const mine = store.save([{ id, modelId: id, nickname: model.name, nozzle: 0.4, isDefault: true }]);
    const setup = resolvePrinter(id, store.read());
    const process = model.presets.processes.find((p) => p.name !== model.presets.process) ?? model.presets.processes[0];
    const project = { ...DEFAULT_PROJECT, printProcess: process.name };
    const printer = jobPrinter(setup, project);

    expect(model).toEqual(bundled);
    expect(model.bed[2]).toEqual([w, d]);
    expect(model.height).toBe(h);
    expect(mine[0]).toEqual({ ...setup.mine, hasSecret: false });
    expect(setup.model.id).toBe(id);
    expect(model.nozzles).toEqual([0.4]);
    expect(printer.machine).toBe(model.presets.machine);
    expect(printer.process).toBe(process.name);
    expect(compatibleWith(findPreset(source.profiles, 'process', process.name, model.vendor), machine)).toBe(true);

    for (const [material, filament] of Object.entries(model.presets.filaments)) {
      const preset = findPreset(source.profiles, 'filament', filament.name, model.vendor);

      expect(compatibleWith(preset, machine)).toBe(true);
      expect(preset.filament_type[0] === 'FLEX' ? 'TPU' : preset.filament_type[0]).toBe(material);
    }

    const flat = flattenPresets({
      slicer,
      dir: path.join(root, id),
      presets: { ...printer, filaments: [printer.filaments.PLA] },
    });
    const spec = archiveSpec(setup, project);
    const { files } = await threeMfIn(roverShapes(), spec);
    const file = path.join(root, id, 'robot.3mf');

    fs.writeFileSync(file, files[spec.groups[0].material]);
    await prepareProject(file, slicer, printer);

    const archive = unzipSync(fs.readFileSync(file));
    const settings = JSON.parse(strFromU8(archive['Metadata/project_settings.config']));

    expect(settings.printer_settings_id).toBe(printer.machine);
    expect(settings.print_settings_id).toBe(process.name);
    expect(settings.nozzle_diameter).toEqual(['0.4']);
    expect(settings.printable_area).toEqual(machine.printable_area);
    expect(archive['3D/3dmodel.model']).toEqual(unzipSync(files[spec.groups[0].material])['3D/3dmodel.model']);
    expect(settings.overhang_4_4_speed).toEqual(JSON.parse(fs.readFileSync(flat.process, 'utf8')).overhang_4_4_speed);
    expect(settings.layer_height).toBe(JSON.parse(fs.readFileSync(flat.process, 'utf8')).layer_height);
    expect(settings.filament_settings_id).toEqual([printer.filaments.PLA, printer.filaments.PETG].filter(Boolean));
    expect(strFromU8(archive['3D/3dmodel.model'])).toContain('Rover body');
    expect(strFromU8(archive['Metadata/model_settings.config'])).toContain('Rover tire');
  },
);

it.each(['prusa-core-one', 'prusa-core-one-l'])(
  'carries corrected inherited overhang speeds for %s to both preparation paths',
  async (id) => {
    const model = catalog.find((m) => m.id === id);
    const source = sources.find((s) => s.slicer === 'orca');
    const dir = path.join(root, id);
    const presets = { ...model.presets, vendor: model.vendor, filaments: [model.presets.filaments.PLA.name] };
    const files = flattenPresets({ slicer: { profiles: source.profiles }, presets, dir });
    const process = JSON.parse(fs.readFileSync(files.process, 'utf8'));

    expect([
      process.overhang_1_4_speed,
      process.overhang_2_4_speed,
      process.overhang_3_4_speed,
      process.overhang_4_4_speed,
    ]).toEqual(['80%', '50', '25', '15']);

    const setup = resolvePrinter(id, []);
    const spec = archiveSpec(setup, { ...DEFAULT_PROJECT, printProcess: model.presets.process });
    const { files: archives } = await threeMfIn(roverShapes(), spec);
    const file = path.join(dir, 'default-process.3mf');

    fs.writeFileSync(file, archives[spec.groups[0].material]);
    await prepareProject(file, { profiles: source.profiles }, { vendor: model.vendor });

    const settings = JSON.parse(strFromU8(unzipSync(fs.readFileSync(file))['Metadata/project_settings.config']));

    expect([
      settings.overhang_1_4_speed,
      settings.overhang_2_4_speed,
      settings.overhang_3_4_speed,
      settings.overhang_4_4_speed,
    ]).toEqual(['80%', '50', '25', '15']);
  },
);

it('refuses missing installed presets and preserves bundled provenance separately', () => {
  const setup = resolvePrinter('prusa-core-one', []);
  const printer = jobPrinter(setup, DEFAULT_PROJECT);

  expect(() =>
    flattenPresets({
      slicer: { profiles: sources[0].profiles },
      dir: root,
      presets: { ...printer, filaments: [printer.filaments.PLA] },
    }),
  ).toThrow('no printer profile');
  expect(setup.model.source).toEqual({ slicer: 'orca', version: '2.5.2' });
});

it('does not substitute a supported printer or nozzle for an incompatible saved selection', () => {
  const saved = { id: 'old', modelId: 'bambu-lab-h3c', nickname: 'H3C', nozzle: 0.4 };
  const setup = resolvePrinter(saved.id, [saved]);

  expect(setup.model.id).toBe(saved.modelId);
  expect(setup.model.presets).toBeNull();
  expect(jobPrinter(setup, DEFAULT_PROJECT)).toBeNull();
  expect(jobPrinter({ ...resolvePrinter('bambu-lab-p1s', []), nozzle: 0.6 }, DEFAULT_PROJECT)).toBeNull();
});

it.each(['machine', 'process', 'filament'])('refuses a missing installed %s preset in both handoffs', async (kind) => {
  const setup = resolvePrinter('prusa-core-one', []);
  const printer = jobPrinter(setup, DEFAULT_PROJECT);
  const source = sources.find((s) => s.slicer === 'orca');
  const presets = { ...printer, filaments: [printer.filaments.PLA] };

  if (kind === 'filament') presets.filaments = ['missing'];
  else presets[kind] = 'missing';

  expect(() => flattenPresets({ slicer: source, dir: root, presets })).toThrow('profile named');

  const spec = archiveSpec(setup, DEFAULT_PROJECT);
  const settings = spec.files[0].project.settings;

  if (kind === 'machine') settings.printer_settings_id = 'missing';

  if (kind === 'process') settings.print_settings_id = 'missing';

  if (kind === 'filament') spec.files[0].project.filaments[0].preset = 'missing';

  const { files } = await threeMfIn(roverShapes(), spec);
  const file = path.join(root, `missing-${kind}.3mf`);

  fs.writeFileSync(file, files[spec.groups[0].material]);
  await expect(prepareProject(file, source, printer)).rejects.toThrow('profile named');
});

it('refuses unavailable CORE One L materials instead of substituting generic presets', async () => {
  const setup = resolvePrinter('prusa-core-one-l', []);
  const spec = projectJobSpec(roverPlan(), setup, DEFAULT_PROJECT);
  const source = sources.find((s) => s.slicer === 'orca');

  expect(Object.keys(setup.model.presets.filaments)).toEqual(['PLA']);
  expect(spec.files[0].project.filaments.map((f) => f.preset)).toEqual([setup.model.presets.filaments.PLA.name, '']);

  const { files } = await threeMfIn(roverShapes(), spec);
  const file = path.join(root, 'unsupported-material.3mf');
  const original = files[spec.groups[0].material];

  fs.writeFileSync(file, original);
  await expect(prepareProject(file, source, spec.printer)).rejects.toThrow('no filament profile');
  expect(fs.readFileSync(file)).toEqual(Buffer.from(original));
});
