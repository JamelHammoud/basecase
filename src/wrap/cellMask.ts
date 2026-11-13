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
    const low = [0, 1, 2].map((a) =>
      Math.floor((Math.min(soup[t + a], soup[t + 3 + a], soup[t + 6 + a]) - reach) / this.size),
    );
    const high = [0, 1, 2].map((a) =>
      Math.floor((Math.max(soup[t + a], soup[t + 3 + a], soup[t + 6 + a]) + reach) / this.size),
    );

    for (let i = low[0]; i <= high[0]; i++)
      for (let j = low[1]; j <= high[1]; j++) for (let k = low[2]; k <= high[2]; k++) this.cells.add(keyOf(i, j, k));
  }
}
