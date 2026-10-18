#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
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

function triangleCollector(rotate) {
  const groups = new Map();
  const addTriangle = (color, xyz) => {
    const key = color.map((c) => Math.round(c * 255)).join(',');

    if (!groups.has(key)) groups.set(key, { color, soup: [] });

    const g = groups.get(key);

    for (let k = 0; k < 9; k += 3) {
      const [x, y, z] = apply(rotate, [xyz[k], xyz[k + 1], xyz[k + 2]]);

      g.soup.push(x, z, -y);
    }
  };

  return { groups, addTriangle };
}

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

function meshingParams(src) {
  if (src.meshing === 'default') return null;

  return {
    linearUnit: 'millimeter',
    linearDeflectionType: 'absolute_value',
    linearDeflection: src.deflection ?? 0.03,
    angularDeflection: src.angularDeflection ?? 0.35,
  };
}

function keepMesh(mesh, { src, hidden }) {
  if (hidden.some((h) => (mesh.name ?? '').toLowerCase().includes(h))) return false;

  return !src.keepBox || insideBox(mesh.attributes.position.array, src.keepBox);
}

function addMesh(mesh, { src, addTriangle }) {
  const pos = mesh.attributes.position.array;
  const idx = mesh.index.array;
  const faceColor = new Array(idx.length / 3).fill(null);

  for (const f of mesh.brep_faces ?? []) for (let t = f.first; t <= f.last; t++) faceColor[t] = f.color;

  for (let t = 0; t < idx.length / 3; t++) {
    const xyz = [];

    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k] * 3;

      xyz.push(pos[v], pos[v + 1], pos[v + 2]);
    }

    addTriangle(faceColor[t] ?? mesh.color ?? src.defaultColor ?? [0.6, 0.6, 0.62], xyz);
  }
}

function readOcct({ id, file, src, addTriangle }) {
  const content = new Uint8Array(fs.readFileSync(file));
  const params = meshingParams(src);
  const ext = path.extname(file).toLowerCase();
  const result =
    ext === '.igs' || ext === '.iges' ? occt.ReadIgesFile(content, params) : occt.ReadStepFile(content, params);

  if (!result.success) {
    console.error(`${id}: OpenCascade could not read ${file}`);

    return false;
  }

  const hidden = (src.hideMeshes ?? []).map((h) => h.toLowerCase());

  for (const mesh of result.meshes) if (keepMesh(mesh, { src, hidden })) addMesh(mesh, { src, addTriangle });

  return true;
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

function insideBox(pos, [lo, hi]) {
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) if (pos[i + k] < lo[k] - 0.01 || pos[i + k] > hi[k] + 0.01) return false;

  return true;
}

function axisRotation(axis, c, s) {
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];

  if (axis === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c];

  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

function rotationMatrix(steps) {
  let m = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  for (const [axis, deg] of steps) {
    const a = (deg * Math.PI) / 180;
    const c = Math.round(Math.cos(a) * 1e12) / 1e12;
    const s = Math.round(Math.sin(a) * 1e12) / 1e12;

    m = mul(axisRotation(axis, c, s), m);
  }

  return m;
}

function mul(a, b) {
  const o = new Array(9).fill(0);

  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];

  return o;
}

function apply(m, [x, y, z]) {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}
