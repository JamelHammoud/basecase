const HULL_BLOCK = /\bhull\(\)\s*\{/g;
const KEPT_HULL = 'hull /* 2d */ () {';
const NOT_3D = /^The part is 2D\./;

export const isHullCrash = (message) => /applyHull|convex_hull_3|assertion violation/.test(String(message));

const HAS_HULL = /\bhull\(\)\s*\{/;

function skipString(text, from) {
  let i = from + 1;

  while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;

  return i;
}

function closingBrace(text, open) {
  let depth = 0;
  let i = open;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '{') depth++;

    if (ch === '}' && --depth === 0) return i;

    i = ch === '"' ? skipString(text, i) + 1 : i + 1;
  }

  return -1;
}

export function innermostHull(text) {
  for (const match of text.matchAll(HULL_BLOCK)) {
    const open = match.index + match[0].length - 1;
    const close = closingBrace(text, open);
    const body = close === -1 ? '' : text.slice(open + 1, close);

    if (close !== -1 && !HAS_HULL.test(body)) return { start: match.index, end: close + 1, body };
  }

  return null;
}

let manifold = null;

async function manifoldApi() {
  if (!manifold) {
    const wasm = await (await import('manifold-3d/manifold.js')).default();

    wasm.setup();
    manifold = wasm.Manifold;
  }

  return manifold;
}

const num = (v) => (Object.is(v, -0) ? '0' : String(v));

export async function hullPolyhedron(positions) {
  const Manifold = await manifoldApi();
  const points = [];

  for (let i = 0; i < positions.length; i += 3) points.push([positions[i], positions[i + 1], positions[i + 2]]);

  const solid = Manifold.hull(points);
  const mesh = solid.getMesh();

  solid.delete();

  const stride = mesh.numProp;
  const verts = [];
  const faces = [];

  for (let i = 0; i < mesh.vertProperties.length; i += stride) {
    verts.push(
      `[${num(mesh.vertProperties[i])},${num(mesh.vertProperties[i + 1])},${num(mesh.vertProperties[i + 2])}]`,
    );
  }

  for (let t = 0; t < mesh.triVerts.length; t += 3) {
    faces.push(`[${mesh.triVerts[t]},${mesh.triVerts[t + 2]},${mesh.triVerts[t + 1]}]`);
  }

  if (!faces.length) throw new Error('hull() of these children has no volume.');

  return `polyhedron(points=[${verts.join(',')}], faces=[${faces.join(',')}]);`;
}

async function bodyHull(body, renderBody) {
  try {
    const { positions } = await renderBody(body);

    return await hullPolyhedron(positions);
  } catch (err) {
    if (NOT_3D.test(String(err?.message))) return null;

    throw err;
  }
}

export async function resolveHulls(csg, renderBody) {
  const done = new Map();
  let text = csg;

  for (let block = innermostHull(text); block; block = innermostHull(text)) {
    if (!done.has(block.body)) done.set(block.body, await bodyHull(block.body, renderBody));

    const solved = done.get(block.body);
    const replacement = solved ?? `${KEPT_HULL}${block.body}}`;

    text = text.slice(0, block.start) + replacement + text.slice(block.end);
  }

  return { text, hulls: done.size };
}
