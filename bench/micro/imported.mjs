import { compileCsg } from './csg.mjs';
import { toScene } from './geometry.mjs';

const DEG = Math.PI / 180;
const PRINTED_TAG = '3D Printed PLA/PETG';
const tidy = (v) => Math.round(v * 1e4) / 1e4;

export const turnZ = (deg, [x, y, z]) => {
  const [c, s] = [Math.cos(deg * DEG), Math.sin(deg * DEG)];

  return [x * c - y * s, x * s + y * c, z];
};

function bounds(points) {
  const lo = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])));

  return { center: lo.map((v, k) => tidy((v + hi[k]) / 2)), size: hi.map((v, k) => tidy(v - lo[k])) };
}

async function importedPart(spec, { file, turnDeg, group }) {
  const cad = await compileCsg(spec.solid);
  const points = [];

  for (let i = 0; i < cad.positions.length; i += 3) points.push(toScene(turnZ(turnDeg, cad.positions.slice(i, i + 3))));

  const { center, size } = bounds(points);

  return {
    id: spec.id,
    name: spec.name,
    kind: 'mesh',
    category: 'structure',
    role: 'solid',
    position: center,
    rotation: [0, 0, 0],
    dimensions: { width: size[0], height: size[1], depth: size[2] },
    color: spec.color ?? '#a1a1aa',
    note: '',
    mechanicalTag: PRINTED_TAG,
    visible: true,
    locked: false,
    group,
    mesh: {
      positions: points.flatMap((p) => p.map((v, k) => tidy(v - center[k]))),
      indices: cad.indices,
      baseSize: size,
      source: file,
      file,
    },
  };
}

export async function importedParts(fixture) {
  const from = fixture.imported;

  if (!from) return [];

  const group = { id: 'group-import', name: from.file.replace(/\.[^.]+$/, '') };

  return Promise.all(from.parts.map((spec) => importedPart(spec, { ...from, group })));
}
