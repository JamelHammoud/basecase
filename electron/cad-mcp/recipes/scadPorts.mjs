import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LIBRARIES = [
  [path.join(root, 'vendor', 'BOSL2'), '/libraries/BOSL2'],
  [path.join(root, 'vendor', 'robotics'), '/libraries'],
];
const PRELUDE = '$fa = 6; $fs = 0.5; ';

let files = null;

function readTree(dir, prefix) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;

    if (entry.isDirectory()) return readTree(full, rel);

    return entry.name.endsWith('.scad') ? [[rel, fs.readFileSync(full, 'utf-8')]] : [];
  });
}

function mkdirs(FS, file) {
  let cur = '';

  for (const part of path.posix.dirname(file).split('/').filter(Boolean)) {
    cur += `/${part}`;

    if (!FS.analyzePath(cur).exists) FS.mkdir(cur);
  }
}

function parseValue(text) {
  return JSON.parse(text.replace(/\bundef\b/g, 'null'));
}

export function parsePorts(echoText) {
  return echoText
    .split('\n')
    .filter((line) => line.startsWith('ECHO: "PORT"'))
    .map((line) => {
      const [, name, pos, axis, kind, d] = parseValue(`[${line.slice('ECHO: '.length)}]`);

      return { name, pos, axis, kind, ...(d === undefined ? {} : { d }) };
    });
}

const INCLUDE = /^\s*include\s*<[^>]+>\s*;?\s*$/;

function batchSource(codes) {
  const includes = [...new Set(codes.flatMap((code) => code.split('\n').filter((line) => INCLUDE.test(line))))];
  const bodies = codes.map((code, i) => {
    const body = code
      .split('\n')
      .filter((line) => !INCLUDE.test(line))
      .join('\n');

    return `module _recipe_${i}() {\n${body}\n}\necho("RECIPE", ${i});\n_recipe_${i}();`;
  });

  return [...includes, ...bodies].join('\n');
}

export async function scadPortsBatch(codes) {
  const { echo, logs } = await scadPorts(batchSource(codes));
  const chunks = echo.split(/^ECHO: "RECIPE", \d+$/m).slice(1);

  return { ports: codes.map((_, i) => parsePorts(chunks[i] ?? '')), logs };
}

export async function scadPorts(code) {
  const { createOpenSCAD } = await import('openscad-wasm');

  files ??= LIBRARIES.flatMap(([dir, prefix]) => readTree(dir, prefix));

  const logs = [];
  const scad = await createOpenSCAD({ noInitialRun: true, print: (s) => logs.push(s), printErr: (s) => logs.push(s) });
  const FS = scad.getInstance().FS;

  for (const [file, content] of files) {
    mkdirs(FS, file);
    FS.writeFile(file, content);
  }

  FS.writeFile('/part.scad', PRELUDE + code);
  scad.getInstance().callMain(['/part.scad', '-o', '/part.echo']);

  const echo = FS.analyzePath('/part.echo').exists ? new TextDecoder().decode(FS.readFile('/part.echo')) : '';

  return { ports: parsePorts(echo), echo, logs };
}

function runWorker(codes) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { scadPortCodes: codes } });

    worker.once('message', (result) => {
      resolve(result);
      worker.terminate();
    });
    worker.once('error', reject);
  });
}

export async function scadPortsParallel(codes, workers = 4) {
  const chunks = Array.from({ length: workers }, (_, w) => codes.map((_, i) => i).filter((i) => i % workers === w));
  const results = await Promise.all(chunks.map((idx) => runWorker(idx.map((i) => codes[i]))));
  const ports = new Array(codes.length);

  chunks.forEach((idx, w) => idx.forEach((i, k) => (ports[i] = results[w].ports[k])));

  return { ports, logs: results.flatMap((r) => r.logs) };
}

if (!isMainThread && workerData?.scadPortCodes) {
  scadPortsBatch(workerData.scadPortCodes).then((result) => parentPort.postMessage(result));
}
