import Module from 'manifold-3d';

export const box = (size, at = [0, 0, 0]) => ({ box: size, at });
export const cyl = (d, h, at = [0, 0, 0], axis = 'z') => ({ cyl: { d, h, axis }, at });
export const sphere = (d, at = [0, 0, 0]) => ({ ellipsoid: [d / 2, d / 2, d / 2], at });
export const ellipsoid = (radii, at = [0, 0, 0]) => ({ ellipsoid: radii, at });
export const diff = (base, ...cuts) => ({ diff: [base, ...cuts] });
export const union = (...nodes) => ({ union: nodes });

const AXIS_ROTATION = { x: [0, 90, 0], y: [90, 0, 0], z: [0, 0, 0] };
const num = (v) => String(Math.round(v * 1000) / 1000);
const vec = (v) => `[${v.map(num).join(', ')}]`;
const isOrigin = (at) => at.every((v) => v === 0);
const placed = (at, body) => (isOrigin(at) ? body : `translate(${vec(at)}) ${body}`);

function cylScad({ d, h, axis }) {
  const body = `cylinder(d = ${num(d)}, h = ${num(h)}, center = true);`;

  return axis === 'z' ? body : `rotate(${vec(AXIS_ROTATION[axis])}) ${body}`;
}

function listScad(name, nodes, pad) {
  const inner = nodes.map((n) => `${pad}  ${toScadLine(n, `${pad}  `)}`).join('\n');

  return `${name}() {\n${inner}\n${pad}}`;
}

function toScadLine(node, pad) {
  if (node.box) return placed(node.at, `cube(${vec(node.box)}, center = true);`);

  if (node.cyl) return placed(node.at, cylScad(node.cyl));

  if (node.ellipsoid) return placed(node.at, `scale(${vec(node.ellipsoid)}) sphere(r = 1);`);

  if (node.diff) return listScad('difference', node.diff, pad);

  return listScad('union', node.union, pad);
}

export const toScad = (node) => `${toScadLine(node, '')}\n`;

const segments = (d) => Math.min(60, Math.max(12, Math.ceil((Math.PI * d) / 0.5)));

function toManifold(M, node) {
  if (node.box) return M.cube(node.box, true).translate(node.at);

  if (node.cyl) {
    const { d, h, axis } = node.cyl;

    return M.cylinder(h, d / 2, d / 2, segments(d), true)
      .rotate(AXIS_ROTATION[axis])
      .translate(node.at);
  }

  if (node.ellipsoid) {
    const r = Math.max(...node.ellipsoid);

    return M.sphere(1, segments(2 * r))
      .scale(node.ellipsoid)
      .translate(node.at);
  }

  if (node.diff) {
    const [base, ...cuts] = node.diff.map((n) => toManifold(M, n));

    return cuts.reduce((acc, c) => acc.subtract(c), base);
  }

  return M.union(node.union.map((n) => toManifold(M, n)));
}

let wasm = null;

export async function csgKernel() {
  if (!wasm) {
    wasm = await Module();
    wasm.setup();
  }

  return wasm.Manifold;
}

export async function compileCsg(node) {
  const M = await csgKernel();
  const solid = toManifold(M, node);
  const mesh = solid.getMesh();
  const positions = [];

  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp)
    positions.push(mesh.vertProperties[i], mesh.vertProperties[i + 1], mesh.vertProperties[i + 2]);

  return {
    language: 'openscad',
    code: toScad(node),
    positions,
    indices: [...mesh.triVerts],
    edges: null,
    stats: { volume: Math.round(solid.volume() * 10) / 10 },
  };
}
