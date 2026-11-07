import { fork } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSourced, putSourced, sourcedDir } from '../backend/sourced.mjs';
import { publicFetch, readCapped } from '../publicFetch.mjs';
import { assertHttps, siteOf } from './linkCheck.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const MAX_DOWNLOAD = 200_000_000;
const DOWNLOAD_MS = 120_000;
const CONVERT_MS = 150_000;
const SIZE_TOLERANCE_MM = 1;
const SIZE_TOLERANCE_SHARE = 0.03;
const CLEARANCE_TO_THREAD = [
  [2.4, 'M2'],
  [2.9, 'M2.5'],
  [3.6, 'M3'],
  [4.6, 'M4'],
  [5.6, 'M5'],
  [6.8, 'M6'],
];

const realDir = (dir) => {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
};

const readAllow = (dir) => Array.from(new Set([dir, realDir(dir)])).map((d) => `--allow-fs-read=${path.join(d, '*')}`);

const NETWORK_PERMISSION_NODE = 25;

function sandboxArgs(jobDir) {
  if (Number(process.versions.node.split('.')[0]) < NETWORK_PERMISSION_NODE) return [];

  return [
    '--permission',
    ...readAllow(path.join(root, 'node_modules')),
    ...readAllow(here),
    ...readAllow(jobDir),
    `--allow-fs-write=${path.join(jobDir, '*')}`,
  ];
}

export function convertSandboxed(job, jobDir) {
  return new Promise((resolve, reject) => {
    const proc = fork(path.join(here, 'convertWorker.mjs'), [], {
      execArgv: sandboxArgs(jobDir),
      env: process.env.ELECTRON_RUN_AS_NODE ? { ELECTRON_RUN_AS_NODE: '1' } : {},
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Converting took too long. The file may be too big for the built-in reader.'));
    }, CONVERT_MS);
    let stderr = '';

    proc.stderr?.on('data', (d) => {
      stderr = `${stderr}${d}`.slice(-500);
    });
    proc.on('message', (m) => {
      if (m?.ready) proc.send(job);
      else if (m?.error) reject(new Error(m.error));
      else if (m?.result) resolve(m.result);
    });
    proc.once('exit', (code) => {
      clearTimeout(timer);

      if (code) reject(new Error(`The converter stopped (${code}). ${stderr}`.trim()));
    });
  });
}

async function downloadCad(url, dir) {
  const file = path.join(dir, 'source.cad');

  const urlFile = path.join(dir, 'source.url');
  const kept = fs.existsSync(file) && fs.existsSync(urlFile) && fs.readFileSync(urlFile, 'utf8') === url;

  if (kept) return file;

  const res = await publicFetch(url, { signal: AbortSignal.timeout(DOWNLOAD_MS) });

  if (!res.ok) throw new Error(`The download returned ${res.status}.`);

  fs.writeFileSync(file, await readCapped(res, MAX_DOWNLOAD, 'The CAD file'));
  fs.writeFileSync(urlFile, url);

  return file;
}

export function sizeMismatch(size, expected) {
  if (!expected?.length) return 'no expected size was given';

  const [a, b] = [[...size].sort((x, y) => x - y), [...expected].sort((x, y) => x - y)];
  const off = a.findIndex((v, i) => Math.abs(v - b[i]) > Math.max(SIZE_TOLERANCE_MM, b[i] * SIZE_TOLERANCE_SHARE));

  return off < 0 ? null : `the mesh is ${size.join(' × ')} mm, the datasheet says ${expected.join(' × ')} mm`;
}

const threadFor = (diameter) => CLEARANCE_TO_THREAD.find(([limit]) => diameter <= limit)?.[1];

export function portsFromHoles(holes) {
  return holes.map((h, i) => ({
    name: `hole-${i + 1}`,
    position: h.position.map((v) => Math.round(v * 100) / 100),
    axis: h.axis,
    kind: 'screw',
    diameterMm: Math.round(h.diameterMm * 100) / 100,
    thread: threadFor(h.diameterMm),
  }));
}

export async function importMakerCad(libraryDir, p) {
  assertHttps(p.url, 'The CAD link');

  const item = listSourced(libraryDir).find((x) => x.id === p.id);

  if (!item) throw new Error(`No sourced item "${p.id}". Add it with add_sourced_item first.`);

  const dir = sourcedDir(libraryDir, p.id);

  fs.mkdirSync(dir, { recursive: true });

  const file = await downloadCad(p.url, dir);
  const result = await convertSandboxed(
    {
      id: p.id,
      url: p.url,
      file,
      out: path.join(dir, 'mesh.glb'),
      ext: path.extname(new URL(p.url).pathname).toLowerCase(),
      member: p.member,
      rotate: p.rotate,
    },
    dir,
  );
  const fromMaker = siteOf(p.url) === siteOf(item.url);
  const mismatch = sizeMismatch(result.size, p.expectMm);
  const ports = portsFromHoles(result.holes);
  const mesh = {
    size: result.size,
    origin: result.originOffset,
    triangles: result.triangles,
    source: fromMaker ? 'manufacturer' : 'checked',
    cadUrl: p.url,
    license: String(p.license ?? 'not stated').slice(0, 120),
    rotate: p.rotate ?? [],
    member: p.member,
    ports,
    sizeProblem: mismatch ?? undefined,
  };

  return { item: putSourced(libraryDir, { ...item, mesh }), members: result.members, mismatch };
}
