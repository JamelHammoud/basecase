import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { listVendors, loadVendor, resolvePreset } from './profiles.mjs';

const vendorCache = new Map();

function vendorsOf(profilesDir) {
  if (!vendorCache.has(profilesDir)) {
    const vendors = new Map();

    for (const name of listVendors(profilesDir)) vendors.set(name, null);

    vendorCache.set(profilesDir, vendors);
  }

  return vendorCache.get(profilesDir);
}

function vendor(profilesDir, name) {
  const vendors = vendorsOf(profilesDir);

  if (!vendors.get(name)) vendors.set(name, loadVendor(profilesDir, name));

  return vendors.get(name);
}

export function findPreset(profilesDir, kind, name, preferred) {
  const order = [preferred, ...vendorsOf(profilesDir).keys()].filter(Boolean);

  for (const vendorName of [...new Set(order)]) {
    const v = vendorsOf(profilesDir).has(vendorName) ? vendor(profilesDir, vendorName) : null;

    if (v?.[kind].has(name)) return resolvePreset(v[kind], name);
  }

  return null;
}

function writeFlat(file, preset, overrides = {}) {
  const flat = { ...preset, ...overrides };

  delete flat.inherits;
  fs.writeFileSync(file, JSON.stringify(flat));

  return file;
}

const missing = (kind, name) =>
  new Error(`The slicer has no ${kind} profile named “${name}”. Update the slicer or pick another printer.`);

export function flattenPresets({ slicer, presets, dir }) {
  const { vendor: preferred, machine, process, filaments, infillPct, bedType } = presets;
  const machinePreset = findPreset(slicer.profiles, 'machine', machine, preferred);
  const processPreset = findPreset(slicer.profiles, 'process', process, preferred);

  if (!machinePreset) throw missing('printer', machine);

  if (!processPreset) throw missing('process', process);

  const processOverrides = {
    ...(infillPct ? { sparse_infill_density: `${infillPct}%` } : {}),
    ...(bedType ? { curr_bed_type: bedType } : {}),
  };

  return {
    machine: writeFlat(path.join(dir, 'machine.json'), machinePreset),
    process: writeFlat(path.join(dir, 'process.json'), processPreset, processOverrides),
    filaments: filaments.map((name, i) => {
      const preset = findPreset(slicer.profiles, 'filament', name, preferred);

      if (!preset) throw missing('filament', name);

      return writeFlat(path.join(dir, `filament-${i + 1}.json`), preset);
    }),
  };
}

function cliArgs({ settings, input, outDir, output, slice }) {
  return [
    '--debug',
    '2',
    '--arrange',
    '0',
    '--load-settings',
    `${settings.machine};${settings.process}`,
    '--load-filaments',
    settings.filaments.join(';'),
    ...(slice ? ['--slice', '0'] : []),
    '--outputdir',
    outDir,
    '--export-3mf',
    output,
    input,
  ];
}

function readResult(outDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(outDir, 'result.json'), 'utf8'));
  } catch {
    return null;
  }
}

function failure(result, stderr, code) {
  const text = result?.error_string && result.error_string !== 'Success.' ? result.error_string : null;
  const lastError = stderr
    .split('\n')
    .reverse()
    .find((l) => /\[error\]/.test(l));

  return new Error(text ?? lastError?.replace(/^.*\[error\]\s*/, '').trim() ?? `The slicer stopped with code ${code}.`);
}

export function runSlicer(options) {
  const { slicer, outDir, signal } = options;

  fs.rmSync(path.join(outDir, 'result.json'), { force: true });

  return new Promise((resolve, reject) => {
    const child = spawn(slicer.binary, cliArgs(options), { cwd: outDir, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const onAbort = () => child.kill('SIGTERM');

    signal?.addEventListener('abort', onAbort);

    const collect = (chunk) => {
      log = (log + chunk.toString()).slice(-20000);
    };

    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (e) => reject(new Error(`Couldn’t start ${slicer.name}: ${e.message}`, { cause: e })));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);

      const result = readResult(outDir);

      if (signal?.aborted) reject(new Error('Slicing stopped.'));
      else if (code === 0 && result?.return_code === 0) resolve(result);
      else reject(failure(result, log, code));
    });
  });
}

const dataUrl = (bytes) => (bytes ? `data:image/png;base64,${Buffer.from(bytes).toString('base64')}` : null);

function plateWarnings(plate) {
  const raw = plate.warning_message ?? [];
  const list = Array.isArray(raw) ? raw : [raw];

  return list
    .map((w) => (typeof w === 'string' ? w : (w?.msg ?? w?.message ?? '')))
    .map((w) => String(w).trim())
    .filter(Boolean);
}

export function readSliced(file, result) {
  const zip = unzipSync(fs.readFileSync(file), {
    filter: (f) => /Metadata\/plate_\d+_small\.png$|Metadata\/plate_\d+\.png$|slice_info\.config$/.test(f.name),
  });
  const info = zip['Metadata/slice_info.config'] ? strFromU8(zip['Metadata/slice_info.config']) : '';
  const supportUsed = [...info.matchAll(/key="support_used" value="(\w+)"/g)].map((m) => m[1] === 'true');

  return (result?.sliced_plates ?? []).map((plate, i) => ({
    number: plate.id,
    seconds: Math.round(plate.total_predication ?? plate.main_predication ?? 0),
    grams: (plate.filaments ?? []).reduce((s, f) => s + (f.total_used_g ?? 0), 0),
    support: supportUsed[i] ?? false,
    warnings: plateWarnings(plate),
    thumbnail: dataUrl(zip[`Metadata/plate_${plate.id}_small.png`] ?? zip[`Metadata/plate_${plate.id}.png`]),
  }));
}

export function extractPlateGcode(file, plate, outFile) {
  const name = `Metadata/plate_${plate}.gcode`;
  const zip = unzipSync(fs.readFileSync(file), { filter: (f) => f.name === name });

  if (!zip[name]) throw new Error(`Plate ${plate} isn’t in the sliced file. Slice again.`);

  fs.writeFileSync(outFile, zip[name]);

  return outFile;
}
