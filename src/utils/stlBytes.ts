const HEADER = 80;
const FACET = 50;

function writeFacet(view: DataView, at: number, triangles: ArrayLike<number>, i: number) {
  const ax = triangles[i];
  const ay = triangles[i + 1];
  const az = triangles[i + 2];
  const bx = triangles[i + 3];
  const by = triangles[i + 4];
  const bz = triangles[i + 5];
  const cx = triangles[i + 6];
  const cy = triangles[i + 7];
  const cz = triangles[i + 8];
  const ux = bx - ax,
    uy = by - ay,
    uz = bz - az;
  const vx = cx - ax,
    vy = cy - ay,
    vz = cz - az;
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;

  view.setFloat32(at, nx / len, true);
  view.setFloat32(at + 4, ny / len, true);
  view.setFloat32(at + 8, nz / len, true);
  view.setFloat32(at + 12, ax, true);
  view.setFloat32(at + 16, ay, true);
  view.setFloat32(at + 20, az, true);
  view.setFloat32(at + 24, bx, true);
  view.setFloat32(at + 28, by, true);
  view.setFloat32(at + 32, bz, true);
  view.setFloat32(at + 36, cx, true);
  view.setFloat32(at + 40, cy, true);
  view.setFloat32(at + 44, cz, true);
}

export class StlWriter {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  readonly triangle = new Float32Array(9);
  private at = HEADER + 4;

  constructor(count: number) {
    this.bytes = new Uint8Array(HEADER + 4 + count * FACET);
    this.view = new DataView(this.bytes.buffer);
    this.view.setUint32(HEADER, count, true);
  }

  facet(): void {
    writeFacet(this.view, this.at, this.triangle, 0);
    this.at += FACET;
  }
}

export function binaryStl(triangles: ArrayLike<number>): Uint8Array {
  const count = Math.floor(triangles.length / 9);
  const bytes = new Uint8Array(HEADER + 4 + count * FACET);
  const view = new DataView(bytes.buffer);

  view.setUint32(HEADER, count, true);

  for (let f = 0; f < count; f++) writeFacet(view, HEADER + 4 + f * FACET, triangles, f * 9);

  return bytes;
}
