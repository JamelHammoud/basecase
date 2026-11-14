import { MB } from '../fileSize.mjs';

export const CONVERT_MS = 150_000;
export const MAX_SOURCE_BYTES = 200 * MB;

export const CONVERT_MESSAGES = {
  timeout: 'Converting took too long. The file may be too big for the built-in reader.',
  stopped: 'The converter stopped (time or memory limit). The file may be too big for the built-in reader.',
};

const MAX_TEXT = 2000;
const MAX_HOLES = 500;
const MAX_MEMBERS = 200;
const AXES = new Set(['x', 'y', 'z']);
const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46];

const shortText = (value, what) => {
  if (typeof value !== 'string' || value.length > MAX_TEXT) throw new Error(`The converter job has a bad ${what}.`);

  return value;
};

const isRotationStep = (step) => Array.isArray(step) && AXES.has(step[0]) && Number.isFinite(step[1]);

function checkedRotation(rotate = []) {
  if (!Array.isArray(rotate) || rotate.length > 4 || !rotate.every(isRotationStep)) {
    throw new Error('The rotation must be up to 4 steps like ["x", 90].');
  }

  return rotate.map(([axis, deg]) => [axis, deg]);
}

export function checkedConvertJob({ id, url, name, ext, member, rotate, bytes, bodies }) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_SOURCE_BYTES) throw new Error('The CAD file is too big.');

  return {
    convert: true,
    partId: shortText(id, 'id'),
    url: shortText(url, 'link'),
    name: shortText(name, 'file name'),
    ext: shortText(ext ?? '', 'extension').toLowerCase(),
    member: member === undefined ? undefined : shortText(member, 'zip member'),
    rotate: checkedRotation(rotate),
    bodies: bodies === true ? true : undefined,
    bytes,
  };
}

const isTriple = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

const isHole = (h) => isTriple(h?.position) && isTriple(h?.axis) && Number.isFinite(h?.diameterMm) && h.diameterMm > 0;

const isMemberList = (m) =>
  Array.isArray(m) && m.length <= MAX_MEMBERS && m.every((name) => typeof name === 'string' && name.length <= MAX_TEXT);

const isGlb = (glb) => glb?.length > 12 && GLB_MAGIC.every((byte, i) => glb[i] === byte);

function isWellFormed(header, glb) {
  return (
    isGlb(glb) &&
    isTriple(header.size) &&
    isTriple(header.originOffset) &&
    Number.isInteger(header.triangles) &&
    Array.isArray(header.holes) &&
    header.holes.length <= MAX_HOLES &&
    header.holes.every(isHole) &&
    isMemberList(header.members)
  );
}

export function checkedConversion({ header, glb }) {
  if (header?.ok !== true) throw new Error(String(header?.error ?? 'The converter failed.').slice(0, 4000));

  if (!isWellFormed(header, glb)) throw new Error('The converter sent a malformed result, so it was dropped.');

  const { size, originOffset, triangles, holes, members } = header;

  return {
    glb,
    result: {
      size,
      originOffset,
      triangles,
      holes: holes.map(({ position, axis, diameterMm }) => ({ position, axis, diameterMm })),
      members: members.map(String),
    },
  };
}
