export const STEP_EXPORT_MS = 300_000;
export const MAX_STEP_BODIES = 2000;
export const MAX_STEP_CHARS = 60_000_000;

const MAX_TEXT = 200;
const MAX_CODE_CHARS = 400_000;
const MAX_JOB_CODE_CHARS = 4_000_000;
const MAX_JOB_MESH_NUMBERS = 40_000_000;
const MAX_DEPTH = 12;
const MAX_NODES = 400;
const MAX_MM = 1_000_000;
const ORTHO_TOLERANCE = 1e-6;
const HEX = /^#[0-9a-f]{6}$/i;
const OPS = new Set(['union', 'subtract', 'intersect']);
const MALFORMED = 'The CAD kernel sent a malformed STEP file, so it was dropped.';

const fail = (what) => {
  throw new Error(`The STEP export has a bad ${what}.`);
};

const isSize = (v) => Number.isFinite(v) && v > 0 && v <= MAX_MM;

const sizes = (list, count) =>
  Array.isArray(list) && list.length === count && list.every(isSize) ? list.map(Number) : fail('size');

function scaleOf(m) {
  const columns = [0, 1, 2].map((c) => [m[c], m[4 + c], m[8 + c]]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const scale = Math.sqrt(dot(columns[0], columns[0]));
  const square = scale * scale;
  const orthogonal = columns.every((a, i) =>
    columns.every((b, j) => Math.abs(dot(a, b) - (i === j ? square : 0)) <= ORTHO_TOLERANCE * square),
  );

  return orthogonal && scale > 1e-6 ? scale : 0;
}

export function checkedMatrix(m, { rigid = false } = {}) {
  if (!Array.isArray(m) || m.length !== 12 || !m.every((v) => Number.isFinite(v) && Math.abs(v) <= MAX_MM))
    fail('placement');

  const scale = scaleOf(m);

  if (!scale || (rigid && Math.abs(scale - 1) > 1e-6)) fail('placement');

  return m.map(Number);
}

function checkedMesh(solid, budget) {
  const positions = solid.positions;
  const isList = Array.isArray(positions) || positions instanceof Float32Array;

  if (!isList || positions.length < 9 || positions.length % 9 !== 0) fail('mesh');

  budget.numbers += positions.length;

  if (budget.numbers > MAX_JOB_MESH_NUMBERS) fail('mesh');

  for (const v of positions) if (!Number.isFinite(v) || Math.abs(v) > MAX_MM) fail('mesh');

  return { type: 'mesh', positions: Float32Array.from(positions) };
}

function checkedCode(solid, budget) {
  if (typeof solid.code !== 'string' || solid.code.length > MAX_CODE_CHARS) fail('part code');

  budget.code += solid.code.length;

  if (budget.code > MAX_JOB_CODE_CHARS) fail('part code');

  return { type: 'code', code: solid.code };
}

const round = (type, s) => ({ type, radius: sizes([s.radius], 1)[0], height: sizes([s.height], 1)[0] });

const PRIMITIVES = {
  box: (s) => ({ type: 'box', size: sizes(s.size, 3) }),
  cylinder: (s) => ({ type: 'cylinder', radii: sizes(s.radii, 2), height: sizes([s.height], 1)[0] }),
  sphere: (s) => ({ type: 'sphere', radius: sizes([s.radius], 1)[0] }),
  cone: (s) => round('cone', s),
  dome: (s) => round('dome', s),
  capsule: (s) => round('capsule', s),
  torus: (s) => ({ type: 'torus', major: sizes([s.major], 1)[0], minor: sizes([s.minor], 1)[0] }),
};

function checkedSolid(solid, budget, depth = 0) {
  budget.nodes += 1;

  if (!solid || typeof solid !== 'object' || depth > MAX_DEPTH || budget.nodes > MAX_NODES) fail('solid');

  if (Object.hasOwn(PRIMITIVES, solid.type)) return PRIMITIVES[solid.type](solid);

  if (solid.type === 'mesh') return checkedMesh(solid, budget);

  if (solid.type === 'code') return checkedCode(solid, budget);

  if (solid.type === 'moved')
    return { type: 'moved', matrix: checkedMatrix(solid.matrix), solid: checkedSolid(solid.solid, budget, depth + 1) };

  if (solid.type !== 'boolean' || !OPS.has(solid.op) || !Array.isArray(solid.solids) || solid.solids.length < 2)
    fail('solid');

  return { type: 'boolean', op: solid.op, solids: solid.solids.map((s) => checkedSolid(s, budget, depth + 1)) };
}

const shortText = (value, what) => (typeof value === 'string' && value.length <= MAX_TEXT ? value : fail(what));

function checkedBody(body, budget) {
  if (!body || typeof body !== 'object') fail('part');

  return {
    name: shortText(body.name, 'part name'),
    color: typeof body.color === 'string' && HEX.test(body.color) ? body.color.toLowerCase() : fail('colour'),
    group: body.group === undefined ? undefined : shortText(body.group, 'group name'),
    place: checkedMatrix(body.place, { rigid: true }),
    solid: checkedSolid(body.solid, budget),
    fallback: body.fallback === undefined ? undefined : checkedSolid(body.fallback, budget),
  };
}

export function checkedStepJob(payload) {
  const bodies = payload?.bodies;

  if (!Array.isArray(bodies) || bodies.length === 0 || bodies.length > MAX_STEP_BODIES) fail('part list');

  const budget = { code: 0, numbers: 0, nodes: 0 };

  return {
    name: shortText(payload.name, 'scene name'),
    bodies: bodies.map((body) => {
      budget.nodes = 0;

      return checkedBody(body, budget);
    }),
  };
}

const NOT_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/gu;

export function stepName(text, fallback) {
  const clean = String(text ?? '')
    .normalize('NFC')
    .replace(NOT_PRINTABLE, ' ')
    .replace(/'/g, '’')
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return clean || fallback;
}

const parsed = (reply) => {
  if (!(reply instanceof Uint8Array)) return reply;

  try {
    return JSON.parse(new TextDecoder().decode(reply));
  } catch {
    return { ok: false, error: MALFORMED };
  }
};

const isStepText = (step) =>
  typeof step === 'string' &&
  step.length <= MAX_STEP_CHARS &&
  step.startsWith('ISO-10303-21;') &&
  step.trimEnd().endsWith('END-ISO-10303-21;');

export function checkedStepReply(reply, bodyCount) {
  const result = parsed(reply);

  if (result?.ok !== true) throw new Error(String(result?.error ?? 'The CAD kernel failed.').slice(0, 4000));

  const { step, skipped } = result;

  if (!isStepText(step) || !Number.isInteger(skipped) || skipped < 0 || skipped > bodyCount) throw new Error(MALFORMED);

  return { step, skipped };
}
