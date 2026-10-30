import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { safeFileId } from '../backend/constants.mjs';
import { flattenPresets, readSliced, runSlicer } from './slice.mjs';
import { findSlicerApp } from './slicers.mjs';

export const fileStem = (name) =>
  String(name ?? 'robot')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'robot';

export const openWith = (args) =>
  new Promise((resolve, reject) => {
    execFile('open', args, (error) => (error ? reject(new Error(`Couldn’t open it: ${error.message}`)) : resolve()));
  });

const SLICER_ORDER = { BBL: ['bambu', 'orca'] };

export function slicerFor(vendor, wanted) {
  const order = wanted ? [wanted] : (SLICER_ORDER[vendor] ?? ['orca', 'bambu']);

  for (const kind of order) {
    const app = findSlicerApp(kind);

    if (app) return app;
  }

  return null;
}

const groupHash = (job, group) =>
  JSON.stringify([group.material, group.plates.map((p) => p.hash), job.printer, job.infillPct]);

export function jobDir(root, jobId) {
  const id = safeFileId(jobId);

  if (!id) throw new Error('No scene to print.');

  const dir = path.join(root, id);

  fs.mkdirSync(dir, { recursive: true });

  return dir;
}

export function writeJob(root, payload) {
  const dir = jobDir(root, payload.jobId);
  const stem = fileStem(payload.name);
  const groups = (payload.groups ?? []).map((g) => {
    const base = `${stem}-${fileStem(g.material)}`;
    const layout = path.join(dir, `${base}-layout.3mf`);

    fs.writeFileSync(layout, Buffer.from(g.bytes));

    return { material: g.material, plates: g.plates, layout, base };
  });
  const job = {
    jobId: payload.jobId,
    name: payload.name,
    stem,
    printer: payload.printer,
    infillPct: payload.infillPct,
    groups,
  };

  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job, null, 2));

  return { dir, job };
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function settingsFor(job, group, { dir, slicer }) {
  const { printer } = job;
  const filament = printer?.filaments?.[group.material];

  if (!printer?.machine) throw new Error('This printer has no slicer profile. Open the 3MF and pick a printer there.');

  if (!filament)
    throw new Error(`The slicer has no ${group.material} profile for this printer. Pick another material.`);

  return flattenPresets({
    slicer,
    dir,
    presets: { ...printer, filaments: [filament], infillPct: job.infillPct },
  });
}

export async function openJob({ dir, job }, { material, slicer: wanted }) {
  const group = job.groups.find((g) => g.material === material) ?? job.groups[0];

  if (!group) throw new Error('No printed parts to open.');

  const slicer = slicerFor(job.printer?.vendor, wanted);

  if (!slicer || !job.printer?.machine) {
    await openWith([group.layout]);

    return { opened: 'default', file: group.layout };
  }

  const project = `${group.base}.3mf`;

  await runSlicer({
    slicer,
    settings: settingsFor(job, group, { dir, slicer }),
    input: group.layout,
    outDir: dir,
    output: project,
    slice: false,
  });
  await openWith(['-a', slicer.path, path.join(dir, project)]);

  return { opened: slicer.name, file: path.join(dir, project) };
}

async function sliceGroup({ dir, job, group, slicer, signal }) {
  const cacheFile = path.join(dir, `${group.base}.slice.json`);
  const hash = groupHash(job, group);
  const cached = readJson(cacheFile);

  if (cached?.hash === hash && fs.existsSync(cached.file)) return { ...cached, cached: true };

  const output = `${group.base}.gcode.3mf`;
  const result = await runSlicer({
    slicer,
    settings: settingsFor(job, group, { dir, slicer }),
    input: group.layout,
    outDir: dir,
    output,
    slice: true,
    signal,
  });
  const file = path.join(dir, output);
  const byLocal = new Map(group.plates.map((p) => [p.local, p]));
  const plates = readSliced(file, result).map((p) => ({
    ...p,
    local: p.number,
    number: byLocal.get(p.number)?.number ?? p.number,
    hash: byLocal.get(p.number)?.hash ?? null,
    material: group.material,
  }));
  const record = { hash, file, material: group.material, plates };

  fs.writeFileSync(cacheFile, JSON.stringify(record));

  return record;
}

export async function sliceJob({ dir, job }, { signal, progress, wanted }) {
  const slicer = slicerFor(job.printer?.vendor, wanted);

  if (!slicer) throw new Error('Slicing needs Bambu Studio or OrcaSlicer. Install one, then slice again.');

  const records = [];

  for (const group of job.groups) {
    const count = group.plates.length;

    progress(`Slicing ${count} ${group.material} ${count === 1 ? 'plate' : 'plates'} in ${slicer.name}`);
    records.push(await sliceGroup({ dir, job, group, slicer, signal }));
  }

  const record = {
    slicer: { name: slicer.name, version: slicer.version },
    slicedAt: new Date().toISOString(),
    cached: records.every((r) => r.cached),
    files: Object.fromEntries(records.map((r) => [r.material, r.file])),
    plates: records.flatMap((r) => r.plates).sort((a, b) => a.number - b.number),
  };

  fs.writeFileSync(path.join(dir, 'slice.json'), JSON.stringify(record));

  return record;
}

export function slicedPlate(dir, plate) {
  const record = readJson(path.join(dir, 'slice.json'));
  const found = record?.plates.find((p) => p.number === plate);
  const file = found && record.files[found.material];

  if (!found || !file || !fs.existsSync(file)) throw new Error('Slice the plates first.');

  return { file, local: found.local, material: found.material };
}
