import { first, listVendors, loadVendor, parsePoints, resolvePreset } from '../../electron/print/profiles.mjs';
import { matchesCondition } from './condition.mjs';

const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU'];
const MATERIAL_ALIASES = { FLEX: 'TPU' };
const ENCLOSED =
  /Bambu Lab (P1S|P2S|X1|X1 Carbon|X1E|X2D|H2D|H2D Pro|H2S|H2C|H3C)$|Creality K1|Creality K2|Qidi (Q1 Pro|X-Plus|X-Max|X-CF Pro|X-Smart 3)|Voron (2\.4|Trident)|Prusa CORE One/;
const MULTI_TOOL = /\b(MMU\d*|INDX|\d+T)\b/;
const FILAMENT_PENALTY =
  /HF|Silk|Matte|CF|GF|Translucent|Support|Lite|Tough|Aero|Sparkle|Marble|Metal|Wood|Galaxy|Glow|Dynamic|Gradient|for|FR|90A|85A|68D|Pure|Rapid|High Speed/;
const VENDOR_NAMES = { BBL: 'Bambu Lab' };

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const round = (n) => Math.round(n * 100) / 100;

export function compatibleWith(preset, machine) {
  const list = preset.compatible_printers;

  if (Array.isArray(list) && list.length > 0) return list.includes(machine.name);

  return matchesCondition(preset.compatible_printers_condition, machine);
}

function instantiated(index) {
  return [...index.keys()].filter((name) => index.get(name).data.instantiation !== 'false').sort();
}

function processRank(name, defaultProcess) {
  if (/Standard/.test(name)) return 0;

  const style = defaultProcess?.match(/^[\d.]+mm (\S+)/)?.[1];

  return style && name.includes(` ${style} `) ? 1 : 2;
}

function processesFor(vendor, machine) {
  const byLayer = new Map();

  for (const name of instantiated(vendor.process)) {
    const preset = resolvePreset(vendor.process, name);

    if (!preset.layer_height || !compatibleWith(preset, machine)) continue;

    const layer = Number(preset.layer_height);
    const current = byLayer.get(layer);
    const rank = processRank(name, machine.default_print_profile);

    if (!current || rank < current.rank) byLayer.set(layer, { name, rank });
  }

  return [...byLayer.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([layer]) => layer >= 0.08 && layer <= 0.32)
    .map(([layer, { name }]) => ({ name, layer }));
}

function filamentScore(name, material) {
  const generic = /Generic/.test(name) ? 1 : 2;
  const basic = material === 'PLA' && /PLA Basic/.test(name) ? 0 : generic;

  return basic + (FILAMENT_PENALTY.test(name.split('@')[0].replace(material, '')) ? 10 : 0) + name.length / 1000;
}

function filamentsFor(vendor, machine) {
  const best = {};

  for (const name of instantiated(vendor.filament)) {
    const preset = resolvePreset(vendor.filament, name);
    const type = first(preset.filament_type);
    const material = MATERIAL_ALIASES[type] ?? type;

    if (!MATERIALS.includes(material) || !compatibleWith(preset, machine)) continue;

    const score = filamentScore(name, material);

    if (!best[material] || score < best[material].score)
      best[material] = { name, score, density: Number(first(preset.filament_density)) || undefined };
  }

  return Object.fromEntries(
    Object.entries(best)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, { name, density }]) => [m, { name, density }]),
  );
}

function machineFor(vendor, modelName) {
  const names = instantiated(vendor.machine).filter(
    (n) => resolvePreset(vendor.machine, n).printer_model === modelName,
  );

  return names.find((n) => /0\.4 nozzle/.test(n)) ?? names[0];
}

const points = (list) => list.map(([x, y]) => [round(x), round(y)]);

function modelEntry(vendor, model, source) {
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
    bed: points(bed),
    height,
    keepOut: exclude.length >= 3 ? [points(exclude)] : [],
    nozzles: String(model.nozzle_diameter ?? first(machine.nozzle_diameter) ?? '0.4')
      .split(';')
      .map(Number)
      .filter(Boolean)
      .sort((a, b) => a - b),
    enclosed: ENCLOSED.test(model.name),
    bedType: model.default_bed_type ?? null,
    vendor: vendor.vendor,
    source: { slicer: source.slicer, version: source.version },
    presets: {
      machine: machineName,
      process: machine.default_print_profile ?? null,
      processes: processesFor(vendor, machine),
      filaments: filamentsFor(vendor, machine),
    },
  };
}

function vendorModels(source, vendorName) {
  const vendor = loadVendor(source.profiles, vendorName);
  const models = [...vendor.machine.values()]
    .map((e) => e.data)
    .filter((d) => d.type === 'machine_model' && !MULTI_TOOL.test(d.name));

  return models.map((model) => modelEntry(vendor, model, source)).filter(Boolean);
}

const byMakerAndName = (a, b) =>
  a.maker.localeCompare(b.maker) || a.name.localeCompare(b.name, 'en', { numeric: true });

function sourceModels(source) {
  const vendors = listVendors(source.profiles).filter((v) => !source.makers || source.makers.includes(v));

  return vendors.flatMap((v) => vendorModels(source, v)).sort(byMakerAndName);
}

export function buildCatalog(sources) {
  const seen = new Set();
  const models = [];

  for (const source of sources) {
    for (const model of sourceModels(source)) {
      if (seen.has(model.id)) continue;

      seen.add(model.id);
      models.push(model);
    }
  }

  return models.sort(byMakerAndName);
}

export function renderCatalog(models) {
  return `import type { PrinterModel } from './printers';\n\nexport const PRINTER_MODELS: PrinterModel[] = ${JSON.stringify(models, null, 2)};\n`;
}
