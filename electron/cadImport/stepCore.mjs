export function triangleCollector(rotate) {
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

export function meshingParams(src) {
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

export function addMesh(mesh, { src, addTriangle }) {
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

export function insideBox(pos, [lo, hi]) {
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) if (pos[i + k] < lo[k] - 0.01 || pos[i + k] > hi[k] + 0.01) return false;

  return true;
}

function axisRotation(axis, c, s) {
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];

  if (axis === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c];

  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function rotationMatrix(steps) {
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

const isIges = (ext) => ext === '.igs' || ext === '.iges';

export function readOcct(occt, { content, ext, src }) {
  const params = meshingParams(src);
  const result = isIges(ext) ? occt.ReadIgesFile(content, params) : occt.ReadStepFile(content, params);

  return result?.success ? result : null;
}

export function readOcctBytes(occt, { content, ext, src, addTriangle }) {
  const result = readOcct(occt, { content, ext, src });

  if (!result) return false;

  const hidden = (src.hideMeshes ?? []).map((h) => h.toLowerCase());

  for (const mesh of result.meshes) if (keepMesh(mesh, { src, hidden })) addMesh(mesh, { src, addTriangle });

  return true;
}
