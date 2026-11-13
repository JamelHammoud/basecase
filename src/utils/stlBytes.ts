const HEADER = 80;
const FACET = 50;

function writeNormal(view: DataView, at: number, t: ArrayLike<number>, i: number) {
  const ux = t[i + 3] - t[i],
    uy = t[i + 4] - t[i + 1],
    uz = t[i + 5] - t[i + 2];
  const vx = t[i + 6] - t[i],
    vy = t[i + 7] - t[i + 1],
    vz = t[i + 8] - t[i + 2];
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;

  view.setFloat32(at, nx / len, true);
  view.setFloat32(at + 4, ny / len, true);
  view.setFloat32(at + 8, nz / len, true);
}

export function binaryStl(triangles: ArrayLike<number>): Uint8Array {
  const count = Math.floor(triangles.length / 9);
  const bytes = new Uint8Array(HEADER + 4 + count * FACET);
  const view = new DataView(bytes.buffer);

  view.setUint32(HEADER, count, true);

  for (let f = 0; f < count; f++) {
    const at = HEADER + 4 + f * FACET;
    const i = f * 9;

    writeNormal(view, at, triangles, i);

    for (let k = 0; k < 9; k++) view.setFloat32(at + 12 + k * 4, triangles[i + k], true);
  }

  return bytes;
}
