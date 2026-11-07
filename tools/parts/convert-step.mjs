#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { insideBox, readOcctBytes, rotationMatrix, triangleCollector } from '../../electron/cadImport/stepCore.mjs';
import { writePartGlb } from './glb.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = JSON.parse(fs.readFileSync(path.join(here, 'sources.json'), 'utf8'));

const args = process.argv.slice(2);
const ids = args.includes('--all')
  ? Object.keys(SOURCES).filter((id) => SOURCES[id].file || SOURCES[id].files)
  : args.filter((a) => !a.startsWith('--'));

if (ids.length === 0) {
  console.error('Usage: node tools/parts/convert-step.mjs <id…> | --all');
  process.exit(1);
}

const occt = await require('occt-import-js')();

for (const id of ids) convertPart(id);

function readNativeGroups(buf, { src, addTriangle }) {
  let o = 4;

  for (let g = buf.readUInt32LE(0); g > 0; g--) {
    const color = [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)];
    const n = buf.readUInt32LE(o + 12);

    o += 16;

    const floats = new Float32Array(buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + n * 4));

    o += n * 4;

    for (let i = 0; i < floats.length; i += 9) {
      const tri = floats.subarray(i, i + 9);

      if (!src.keepBox || insideBox(tri, src.keepBox)) addTriangle(color, tri);
    }
  }
}

function readNative({ id, file, src, addTriangle }) {
  const bin = path.join(os.tmpdir(), `parts-${id}-${process.pid}.bin`);
  const py = process.env.OCP_PYTHON || 'python3';
  const run = spawnSync(
    py,
    [
      '-I',
      path.join(here, 'step-native.py'),
      file,
      bin,
      String(src.deflection ?? 0.03),
      String(src.angularDeflection ?? 0.35),
    ],
    { stdio: 'inherit' },
  );

  if (run.status !== 0) {
    console.error(`${id}: native reader failed (set OCP_PYTHON to a Python with cadquery-ocp)`);

    return false;
  }

  const buf = fs.readFileSync(bin);

  fs.rmSync(bin);
  readNativeGroups(buf, { src, addTriangle });

  return true;
}

function readOcct({ id, file, src, addTriangle }) {
  const content = new Uint8Array(fs.readFileSync(file));
  const ok = readOcctBytes(occt, { content, ext: path.extname(file).toLowerCase(), src, addTriangle });

  if (!ok) console.error(`${id}: OpenCascade could not read ${file}`);

  return ok;
}

function sourceFiles(src) {
  const files = src?.files ?? (src?.file ? [src.file] : []);

  return files.map((f) => path.resolve(here, f));
}

function convertPart(id) {
  const src = SOURCES[id];
  const files = sourceFiles(src);

  if (files.length === 0) {
    console.error(`${id}: no CAD file in sources.json`);

    return;
  }

  const t0 = Date.now();
  const { groups, addTriangle } = triangleCollector(rotationMatrix(src.rotate ?? []));
  const read = src.reader === 'native' ? readNative : readOcct;
  let failed = false;

  for (const file of files) if (!read({ id, file, src, addTriangle })) failed = true;

  if (failed) return;

  if (groups.size === 0) {
    console.error(`${id}: the file has no triangulated geometry; try "reader": "native" in sources.json`);

    return;
  }

  const stat = writePartGlb(id, [...groups.values()], {
    source: src.url ?? null,
    triangleBudget: src.triangleBudget,
    simplifyError: src.simplifyError,
    colorMap: src.colorMap,
  });

  console.log(
    `${id}: ${stat.size.join(' × ')} mm · ${stat.sourceTriangles} → ${stat.triangles} tris · ${stat.colors} colors · ${(stat.bytes / 1024).toFixed(0)} KB · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}
