import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { buildProbe, enclosedMisses, refineHole } from './holeProbe.mjs';
import { readGlb, viewBytes } from './meshopt.mjs';
import { buildPartGlb } from './partGlb.mjs';
import { readOcctBytes, rotationMatrix, triangleCollector } from './stepCore.mjs';

const require = createRequire(import.meta.url);
const CAD_EXT = /\.(step|stp|igs|iges)$/i;
const MAX_UNZIPPED = 600_000_000;
const MIN_HOLE_MM = 1.8;
const MAX_HOLE_MM = 12;
const STEP_FOR_SCAN = 0.25;

function cadFromZip(bytes, member) {
  let total = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      total += f.originalSize;

      if (total > MAX_UNZIPPED) throw new Error('The archive unpacks to more than 600 MB.');

      return CAD_EXT.test(f.name) && (!member || f.name.endsWith(member));
    },
  });
  const names = Object.keys(files).sort((a, b) => files[b].length - files[a].length);

  if (!names.length) throw new Error('The archive has no STEP or IGES file.');

  return { content: files[names[0]], ext: path.extname(names[0]).toLowerCase(), names };
}

function sourceBytes(job) {
  const bytes = new Uint8Array(fs.readFileSync(job.file));
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (isZip) return cadFromZip(bytes, job.member);

  return { content: bytes, ext: job.ext, names: [path.basename(job.file)] };
}

function meshOfGlb(glb) {
  const { json, bin } = readGlb(glb);
  const view = (accessor) => {
    const a = json.accessors[accessor];
    const raw = Uint8Array.from(viewBytes(json, bin, a.bufferView));
    const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];

    return new Type(raw.buffer, a.byteOffset ?? 0, a.count * (a.type === 'VEC3' ? 3 : 1));
  };
  const positions = [];
  const indices = [];

  for (const prim of json.meshes[0].primitives) {
    const base = positions.length / 3;

    positions.push(...view(prim.attributes.POSITION));

    for (const i of view(prim.indices)) indices.push(base + i);
  }

  return { positions, indices };
}

function holesAlong(mesh, k) {
  const probe = buildProbe(mesh, k);
  const span = probe.box.getSize(probe.box.min.clone());
  const step = Math.max(STEP_FOR_SCAN, Math.max(span.getComponent(probe.u), span.getComponent(probe.v)) / 300);

  return enclosedMisses(probe, step)
    .map((cells) => refineHole(probe, cells, step))
    .filter((h) => h.diameter >= MIN_HOLE_MM && h.diameter <= MAX_HOLE_MM)
    .map((h) => {
      const at = [0, 0, 0];
      const axis = [0, 0, 0];

      at[probe.u] = h.center[0];
      at[probe.v] = h.center[1];
      at[k] = h.faces[1] ?? 0;
      axis[k] = 1;

      return { position: at, axis, diameterMm: h.diameter };
    });
}

async function run(job) {
  const occt = await require('occt-import-js')();
  const { content, ext, names } = sourceBytes(job);
  const { groups, addTriangle } = triangleCollector(rotationMatrix(job.rotate ?? []));
  const ok = readOcctBytes(occt, { content, ext, src: {}, addTriangle });

  if (!ok || !groups.size)
    throw new Error('OpenCascade could not read this file. It may be too big for the built-in reader.');

  const { glb, ...stats } = buildPartGlb(job.id, [...groups.values()], { source: job.url });

  fs.writeFileSync(job.out, glb);

  const mesh = meshOfGlb(glb);

  return { ...stats, holes: [0, 1, 2].flatMap((k) => holesAlong(mesh, k)), members: names };
}

process.on('message', (job) => {
  run(job).then(
    (result) => process.send({ result }, () => process.exit(0)),
    (err) => process.send({ error: String(err?.message ?? err) }, () => process.exit(0)),
  );
});

process.send({ ready: true });
