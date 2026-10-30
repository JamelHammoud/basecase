import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  first,
  listVendors,
  loadVendor,
  parsePoints,
  resolvePreset,
  slicerVersion,
} from '../../electron/print/profiles.mjs';
import { findSlicerApp } from '../../electron/print/slicers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src', 'data', 'printerCatalog.ts');
const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU'];
const ENCLOSED =
  /Bambu Lab (P1S|P2S|X1|X1 Carbon|X1E|X2D|H2D|H2D Pro|H2S|H2C)$|Creality K1|Creality K2|Qidi (Q1 Pro|X-Plus|X-Max|X-CF Pro|X-Smart 3)|Voron (2\.4|Trident)/;
const FILAMENT_PENALTY =
  /HF|Silk|Matte|CF|GF|Translucent|Support|Lite|Tough|Aero|Sparkle|Marble|Metal|Wood|Galaxy|Glow|Dynamic|Gradient|for|FR|90A|85A|68D|Pure|Rapid|High Speed/;
const VENDOR_NAMES = { BBL: 'Bambu Lab' };

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const round = (n) => Math.round(n * 100) / 100;

function compatibleWith(preset, machineName) {
  const list = preset.compatible_printers;

  return !Array.isArray(list) || list.length === 0 || list.includes(machineName);
}

function instantiated(index) {
  return [...index.keys()].filter((name) => index.get(name).data.instantiation !== 'false');
}

function processesFor(vendor, machineName) {
  const byLayer = new Map();

  for (const name of instantiated(vendor.process)) {
    const preset = resolvePreset(vendor.process, name);

    if (!compatibleWith(preset, machineName) || !preset.layer_height) continue;

    const layer = Number(preset.layer_height);
    const current = byLayer.get(layer);
    const standard = /Standard/.test(name);

    if (!current || (standard && !/Standard/.test(current))) byLayer.set(layer, name);
  }

  return [...byLayer.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([layer]) => layer >= 0.08 && layer <= 0.32)
    .map(([layer, name]) => ({ name, layer }));
}

function filamentScore(name, material) {
  const generic = /Generic/.test(name) ? 1 : 2;
  const basic = material === 'PLA' && /PLA Basic/.test(name) ? 0 : generic;

  return basic + (FILAMENT_PENALTY.test(name.replace(material, '')) ? 10 : 0) + name.length / 1000;
}

function filamentsFor(vendor, machineName) {
  const best = {};

  for (const name of instantiated(vendor.filament)) {
    const preset = resolvePreset(vendor.filament, name);
    const material = first(preset.filament_type);

    if (!MATERIALS.includes(material) || !compatibleWith(preset, machineName)) continue;

    const score = filamentScore(name, material);

    if (!best[material] || score < best[material].score)
      best[material] = { name, score, density: Number(first(preset.filament_density)) || undefined };
  }

  return Object.fromEntries(Object.entries(best).map(([m, { name, density }]) => [m, { name, density }]));
}

function machineFor(vendor, modelName) {
  const names = instantiated(vendor.machine).filter((n) => vendor.machine.get(n).data.printer_model === modelName);

  return names.find((n) => /0\.4 nozzle/.test(n)) ?? names[0];
}

function modelEntry(vendor, model) {
  const machineName = machineFor(vendor, model.name);

  if (!machineName) return null;

  const machine = resolvePreset(vendor.machine, machineName);
  const bed = parsePoints(machine.printable_area);
  const height = Number(machine.printable_height);

  if (bed.length < 3 || !height) return null;

  const exclude = parsePoints(machine.bed_exclude_area);

  return {
    id: slug(model.name),
    maker: VENDOR_NAMES[vendor.vendor] ?? vendor.meta?.name ?? vendor.vendor,
    name: model.name,
    bed: bed.map(([x, y]) => [round(x), round(y)]),
    height,
    keepOut: exclude.length >= 3 ? [exclude.map(([x, y]) => [round(x), round(y)])] : [],
    nozzles: String(model.nozzle_diameter ?? first(machine.nozzle_diameter) ?? '0.4')
      .split(';')
      .map(Number)
      .filter(Boolean)
      .sort((a, b) => a - b),
    enclosed: ENCLOSED.test(model.name),
    bedType: model.default_bed_type ?? null,
    vendor: vendor.vendor,
    presets: {
      machine: machineName,
      process: machine.default_print_profile ?? null,
      processes: processesFor(vendor, machineName),
      filaments: filamentsFor(vendor, machineName),
    },
  };
}

function vendorModels(profilesDir, vendorName) {
  const vendor = loadVendor(profilesDir, vendorName);
  const models = [...vendor.machine.values()].map((e) => e.data).filter((d) => d.type === 'machine_model');

  return models.map((model) => modelEntry(vendor, model)).filter(Boolean);
}

function render(models, source) {
  const header = `import type { PrinterModel } from './printers';

export const PRINTER_CATALOG_SOURCE = ${JSON.stringify(source)};

export const PRINTER_MODELS: PrinterModel[] = `;

  return `${header}${JSON.stringify(models, null, 2)};\n`;
}

function main() {
  const appArg = process.argv.indexOf('--app');
  const appPath = appArg > 0 ? process.argv[appArg + 1] : findSlicerApp('bambu')?.path;

  if (!appPath) throw new Error('Bambu Studio not found. Pass --app /path/to/BambuStudio.app');

  const profilesDir = path.join(appPath, 'Contents', 'Resources', 'profiles');
  const models = listVendors(profilesDir)
    .flatMap((v) => vendorModels(profilesDir, v))
    .sort((a, b) => a.maker.localeCompare(b.maker) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  const seen = new Set();
  const unique = models.filter((m) => !seen.has(m.id) && seen.add(m.id));
  const source = { slicer: 'Bambu Studio', version: slicerVersion(appPath) };

  fs.writeFileSync(OUT, render(unique, source));
  execFileSync('npx', ['prettier', '--write', OUT], { cwd: ROOT, stdio: 'ignore' });
  console.log(`Wrote ${unique.length} printers from Bambu Studio ${source.version} to ${path.relative(ROOT, OUT)}`);
}

main();
