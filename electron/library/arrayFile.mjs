const MAGIC = 0x52544342;
const VERSION = 1;
const PREAMBLE = 12;
const MAX_HEADER = 16 * 1024 * 1024;

const MAKERS = {
  f32: (buffer) => new Float32Array(buffer),
  f64: (buffer) => new Float64Array(buffer),
  i32: (buffer) => new Int32Array(buffer),
};

const SIZE = { f32: 4, f64: 8, i32: 4 };

const align8 = (n) => Math.ceil(n / 8) * 8;

export function packArrays(header, arrays, replacer) {
  const json = new TextEncoder().encode(
    JSON.stringify({ ...header, arrays: arrays.map(([key, a]) => [key, a.length]) }, replacer),
  );
  const start = align8(PREAMBLE + json.length);
  const total = arrays.reduce((at, [, a]) => align8(at + a.byteLength), start);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, json.length, true);
  out.set(json, PREAMBLE);

  let at = start;

  for (const [, a] of arrays) {
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), at);
    at = align8(at + a.byteLength);
  }

  return out;
}

function readHeader(bytes, reviver) {
  if (bytes.byteLength < PREAMBLE) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(8, true);

  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== VERSION) return null;

  if (length > MAX_HEADER || PREAMBLE + length > bytes.byteLength) return null;

  try {
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(PREAMBLE, PREAMBLE + length)), reviver);

    return header && typeof header === 'object' && !Array.isArray(header) ? header : null;
  } catch {
    return null;
  }
}

const isCount = (v) => Number.isInteger(v) && v >= 0;

function listedArrays(header, kinds) {
  const listed = header.arrays;

  if (!Array.isArray(listed)) return null;

  const fits = listed.every(
    (entry) => Array.isArray(entry) && Object.hasOwn(kinds, entry[0]) && isCount(entry[1]),
  );

  return fits && new Set(listed.map(([key]) => key)).size === listed.length ? listed : null;
}

export function unpackArrays(bytes, kinds, reviver) {
  const header = readHeader(bytes, reviver);
  const listed = header && listedArrays(header, kinds);

  if (!listed) return null;

  const arrays = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = align8(PREAMBLE + view.getUint32(8, true));

  for (const [key, length] of listed) {
    const kind = kinds[key];
    const size = length * SIZE[kind];

    if (at + size > bytes.byteLength) return null;

    arrays[key] = MAKERS[kind](Uint8Array.prototype.slice.call(bytes, at, at + size).buffer);
    at = align8(at + size);
  }

  return { header, arrays };
}
