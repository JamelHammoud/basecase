const OFFSET = 1 << 10;
const SPAN = 1 << 11;

const keyOf = (i: number, j: number, k: number) => ((i + OFFSET) * SPAN + j + OFFSET) * SPAN + k + OFFSET;

export class CellMask {
  private readonly cells = new Set<number>();
  private readonly size: number;

  constructor(soup: Float32Array, reach: number) {
    this.size = Math.max(reach, 1e-3);

    for (let t = 0; t + 8 < soup.length; t += 9) this.markTriangle(soup, t, reach);
  }

  has(x: number, y: number, z: number): boolean {
    return this.cells.has(keyOf(Math.floor(x / this.size), Math.floor(y / this.size), Math.floor(z / this.size)));
  }

  private markTriangle(soup: Float32Array, t: number, reach: number): void {
    const ax = soup[t];
    const ay = soup[t + 1];
    const az = soup[t + 2];
    const bx = soup[t + 3];
    const by = soup[t + 4];
    const bz = soup[t + 5];
    const cx = soup[t + 6];
    const cy = soup[t + 7];
    const cz = soup[t + 8];
    const lowX = Math.floor((Math.min(ax, bx, cx) - reach) / this.size);
    const lowY = Math.floor((Math.min(ay, by, cy) - reach) / this.size);
    const lowZ = Math.floor((Math.min(az, bz, cz) - reach) / this.size);
    const highX = Math.floor((Math.max(ax, bx, cx) + reach) / this.size);
    const highY = Math.floor((Math.max(ay, by, cy) + reach) / this.size);
    const highZ = Math.floor((Math.max(az, bz, cz) + reach) / this.size);

    for (let i = lowX; i <= highX; i++)
      for (let j = lowY; j <= highY; j++) for (let k = lowZ; k <= highZ; k++) this.cells.add(keyOf(i, j, k));
  }
}
