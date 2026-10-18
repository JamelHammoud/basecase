#!/usr/bin/env node
/**
 * Converts a manufacturer STEP/IGES file into the compact GLB the Parts library loads.
 *
 *   node tools/parts/convert-step.mjs <id>          one part from sources.json
 *   node tools/parts/convert-step.mjs --all         every part with a downloaded CAD file
 *
 * - Reads the B-rep with OpenCascade (occt-import-js), keeping the file's face colors. Files too
 *   big for WebAssembly use native OpenCascade instead ("reader": "native", step-native.py).
 * - Applies the part's orientation from sources.json, then turns the CAD frame (Z up) into
 *   the studio frame (Y up): (x, y, z) → (x, z, −y).
 * - Centers the mesh on its bounding box (the studio's part origin) and records where the
 *   CAD origin landed, so datum-relative features (mounting holes) stay exact.
 * - Merges faces by color, welds, and only simplifies above the triangle budget, with an
 *   error bound well under the tessellation tolerance.
 *
 * Output: public/parts/<id>.glb and its exact size in src/data/component-meshes.json.
 */
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
const ids = args.includes('--all') ? Object.keys(SOURCES).filter((id) => SOURCES[id].file || SOURCES[id].files) : args.filter((a) => !a.startsWith('--'));
if (ids.length === 0) {
  console.error('Usage: node tools/parts/convert-step.mjs <id…> | --all');
  process.exit(1);
}

const occt = await require('occt-import-js')();

for (const id of ids) {
  const src = SOURCES[id];
  // "files" combines several CAD files into one part (e.g. an enclosure and its PCBA)
  const files = (src?.files ?? (src?.file ? [src.file] : [])).map((f) => path.resolve(here, f));
  if (files.length === 0) {
    console.error(`${id}: no CAD file in sources.json`);
    continue;
  }
  const t0 = Date.now();
  const rotate = rotationMatrix(src.rotate ?? []);
  const groups = new Map();
  /** Adds one triangle (CAD frame) to its color group, in the studio frame */
  const addTriangle = (color, xyz) => {
    const key = color.map((c) => Math.round(c * 255)).join(',');
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { color, soup: [] }));
    for (let k = 0; k < 9; k += 3) {
      const [x, y, z] = apply(rotate, [xyz[k], xyz[k + 1], xyz[k + 2]]);
      g.soup.push(x, z, -y);
    }
  };

  let failed = false;
  for (const file of files) {
    if (src.reader === 'native') {
      // Files too large for the WebAssembly readers: native OpenCascade (see step-native.py)
      const bin = path.join(os.tmpdir(), `parts-${id}-${process.pid}.bin`);
      const py = process.env.OCP_PYTHON || 'python3';
      const run = spawnSync(py, ['-I', path.join(here, 'step-native.py'), file, bin, String(src.deflection ?? 0.03), String(src.angularDeflection ?? 0.35)], { stdio: 'inherit' });
      if (run.status !== 0) {
        console.error(`${id}: native reader failed (set OCP_PYTHON to a Python with cadquery-ocp)`);
        failed = true;
        continue;
      }
      const buf = fs.readFileSync(bin);
      fs.rmSync(bin);
      let o = 4;
      for (let g = buf.readUInt32LE(0); g > 0; g--) {
        const color = [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)];
        const n = buf.readUInt32LE(o + 12);
        o += 16;
        const floats = new Float32Array(buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + n * 4));
        o += n * 4;
        for (let i = 0; i < floats.length; i += 9) {
          const tri = floats.subarray(i, i + 9);
          // Native reads come without bodies, so keepBox filters triangles
          if (src.keepBox && !insideBox(tri, src.keepBox)) continue;
          addTriangle(color, tri);
        }
      }
    } else {
      const content = new Uint8Array(fs.readFileSync(file));
      // Some exports only tessellate with OpenCascade's own defaults
      const params = src.meshing === 'default' ? null : {
        linearUnit: 'millimeter',
        linearDeflectionType: 'absolute_value',
        linearDeflection: src.deflection ?? 0.03,
        angularDeflection: src.angularDeflection ?? 0.35,
      };
      const ext = path.extname(file).toLowerCase();
      const result = ext === '.igs' || ext === '.iges' ? occt.ReadIgesFile(content, params) : occt.ReadStepFile(content, params);
      if (!result.success) {
        console.error(`${id}: OpenCascade could not read ${file}`);
        failed = true;
        continue;
      }
      const hidden = (src.hideMeshes ?? []).map((h) => h.toLowerCase());
      for (const mesh of result.meshes) {
        if (hidden.some((h) => (mesh.name ?? '').toLowerCase().includes(h))) continue;
        if (src.keepBox && !insideBox(mesh.attributes.position.array, src.keepBox)) continue;
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
    }
  }
  if (failed) continue;

  if (groups.size === 0) {
    console.error(`${id}: the file has no triangulated geometry; try "reader": "native" in sources.json`);
    continue;
  }

  const stat = writePartGlb(id, [...groups.values()], {
    source: src.url ?? null,
    triangleBudget: src.triangleBudget,
    simplifyError: src.simplifyError,
    colorMap: src.colorMap,
  });
  console.log(`${id}: ${stat.size.join(' × ')} mm · ${stat.sourceTriangles} → ${stat.triangles} tris · ${stat.colors} colors · ${(stat.bytes / 1024).toFixed(0)} KB · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

/* ------------------------------------------------------------------ */

/**
 * "keepBox": [[minX, minY, minZ], [maxX, maxY, maxZ]] in the file's own frame (mm). Bodies not
 * fully inside are dropped: loose accessories laid out beside the product, field-of-view cones.
 */
function insideBox(pos, [lo, hi]) {
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) if (pos[i + k] < lo[k] - 0.01 || pos[i + k] > hi[k] + 0.01) return false;
  return true;
}

/** Rotation from a list like [["x", 90], ["z", -90]] (degrees, applied in order) */
function rotationMatrix(steps) {
  let m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (const [axis, deg] of steps) {
    const a = (deg * Math.PI) / 180;
    const c = Math.round(Math.cos(a) * 1e12) / 1e12;
    const s = Math.round(Math.sin(a) * 1e12) / 1e12;
    const r =
      axis === 'x' ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === 'y' ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1];
    m = mul(r, m);
  }
  return m;
}
function mul(a, b) {
  const o = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return o;
}
function apply(m, [x, y, z]) {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

