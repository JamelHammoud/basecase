export const MAX_BODIES = 1000;
export const BODY_TRIANGLE_BUDGET = 200_000;

const MAX_NAME = 200;
const MAX_VERTICES = BODY_TRIANGLE_BUDGET * 3;
const HEX = /^#[0-9a-f]{6}$/;
const MALFORMED = 'The converter sent a malformed result, so it was dropped.';

const isTriple = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const isCount = (n, max) => Number.isInteger(n) && n > 0 && n <= max;

const isBody = (b) =>
  typeof b?.name === 'string' &&
  b.name.length <= MAX_NAME &&
  typeof b.color === 'string' &&
  HEX.test(b.color) &&
  isTriple(b.center) &&
  isTriple(b.size) &&
  isCount(b.vertices, MAX_VERTICES) &&
  isCount(b.triangles, BODY_TRIANGLE_BUDGET * 2);

const byteLengthOf = (bodies) => bodies.reduce((n, b) => n + (b.vertices + b.triangles) * 3 * 4, 0);

function meshIsSound(data, bodies) {
  let at = 0;

  for (const b of bodies) {
    const positions = new Float32Array(data.slice(at, at + b.vertices * 12).buffer);
    const indices = new Uint32Array(data.slice(at + b.vertices * 12, at + (b.vertices + b.triangles) * 12).buffer);

    if (!positions.every(Number.isFinite) || !indices.every((i) => i < b.vertices)) return false;

    at += (b.vertices + b.triangles) * 12;
  }

  return true;
}

export function checkedBodies({ header, glb: data }) {
  if (header?.ok !== true) throw new Error(String(header?.error ?? 'The converter failed.').slice(0, 4000));

  const { bodies } = header;
  const listed = Array.isArray(bodies) && bodies.length > 0 && bodies.length <= MAX_BODIES && bodies.every(isBody);

  if (!listed || !(data instanceof Uint8Array) || data.length !== byteLengthOf(bodies)) throw new Error(MALFORMED);

  if (!meshIsSound(data, bodies)) throw new Error(MALFORMED);

  return {
    bodies: bodies.map(({ name, color, center, size, vertices, triangles }) => ({
      name,
      color,
      center,
      size,
      vertices,
      triangles,
    })),
    data,
  };
}
