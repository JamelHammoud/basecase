const EXIF_IFD = 0x8769;
const FOCAL_35MM = 0xa405;
const FOCAL = 0x920a;

function reader(buf, start, little) {
  return {
    u16: (o) => (little ? buf.readUInt16LE(start + o) : buf.readUInt16BE(start + o)),
    u32: (o) => (little ? buf.readUInt32LE(start + o) : buf.readUInt32BE(start + o)),
  };
}

function entries(r, offset) {
  const count = r.u16(offset);

  return Array.from({ length: count }, (_, i) => offset + 2 + i * 12).map((at) => ({
    tag: r.u16(at),
    type: r.u16(at + 2),
    at,
  }));
}

function valueOf(r, entry) {
  if (entry.type === 3) return r.u16(entry.at + 8);

  if (entry.type === 4) return r.u32(entry.at + 8);

  if (entry.type !== 5) return null;

  const at = r.u32(entry.at + 8);
  const den = r.u32(at + 4);

  return den ? r.u32(at) / den : null;
}

function tiffFocal(buf, start) {
  const little = buf.toString('ascii', start, start + 2) === 'II';
  const r = reader(buf, start, little);
  const exif = entries(r, r.u32(4)).find((e) => e.tag === EXIF_IFD);

  if (!exif) return null;

  const tags = entries(r, r.u32(exif.at + 8));
  const f35 = tags.find((e) => e.tag === FOCAL_35MM);
  const focal = tags.find((e) => e.tag === FOCAL);

  return { focal35: f35 ? valueOf(r, f35) || null : null, focalMm: focal ? valueOf(r, focal) : null };
}

function exifStart(buf) {
  let at = 2;

  while (at + 4 < buf.length && buf[at] === 0xff) {
    const marker = buf[at + 1];
    const length = buf.readUInt16BE(at + 2);

    if (marker === 0xe1 && buf.toString('ascii', at + 4, at + 8) === 'Exif') return at + 10;

    if (marker === 0xda) return -1;

    at += 2 + length;
  }

  return -1;
}

export function exifFocal(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  try {
    const start = exifStart(buf);

    return start < 0 ? null : tiffFocal(buf, start);
  } catch {
    return null;
  }
}
