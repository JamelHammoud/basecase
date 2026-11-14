import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { safeFileId } from '../backend/constants.mjs';
import { flattenPresets, readSliced, runSlicer } from './slice.mjs';
import { SLICERS, slicerFor, slicerOrder } from './slicers.mjs';
import { plural } from '../plural.mjs';

export const fileStem = (name) =>
  String(name ?? 'robot')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'robot';

const couldntOpen = (error) => new Error(`Couldn’t open it: ${error.message}`);

const run = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, (error) => (error ? reject(couldntOpen(error)) : resolve()));
  });

const launch = (binary, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, { detached: true, stdio: 'ignore' });

    child.once('error', (error) => reject(couldntOpen(error)));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });

export function openFile(file, app = null, platform = process.platform) {
  if (platform === 'darwin') return run('open', app ? ['-a', app.path, file] : [file]);

  if (platform === 'win32' && app) return launch(app.binary, [file]);

  if (platform === 'win32') return run('rundll32', ['url.dll,FileProtocolHandler', file]);

  return app ? launch(app.binary, [file]) : run('xdg-open', [file]);
}

function needsSlicer(printer) {
  const names = slicerOrder(printer).map((kind) => SLICERS[kind].name);

  return new Error(
    `Slicing needs ${names.join(' or ')}. Install ${names.length > 1 ? 'one' : 'it'}, then slice again.`,
  );
}

const groupHash = (job, group) =>
  JSON.stringify([group.material, group.plates.map((p) => p.hash), job.printer, job.infillPct, job.labels]);

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
    labels: typeof payload.labels === 'string' ? payload.labels : '',
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

  const slicer = slicerFor(job.printer, { wanted });

  if (!slicer || !job.printer?.machine) {
    await openFile(group.layout);

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
  await openFile(path.join(dir, project), slicer);

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
  const slicer = slicerFor(job.printer, { wanted });

  if (!slicer) throw needsSlicer(job.printer);

  const records = [];

  for (const group of job.groups) {
    const count = group.plates.length;

    progress(`Slicing ${plural(count, `${group.material} plate`)} in ${slicer.name}`);
    records.push(await sliceGroup({ dir, job, group, slicer, signal }));
  }

  const record = {
    slicer: { name: slicer.name, version: slicer.version },
    slicedAt: new Date().toISOString(),
    cached: records.every((r) => r.cached),
    labels: job.labels,
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
