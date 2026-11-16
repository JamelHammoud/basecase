import { StlWriter } from '../utils/stlBytes';

export function posedStl(positions: ArrayLike<number>, m: number[]): Uint8Array {
  const writer = new StlWriter(Math.floor(positions.length / 9));

  const triangle = writer.triangle;

  for (let f = 0; f < Math.floor(positions.length / 9); f++) {
    for (let k = 0; k < 9; k += 3) {
      const i = f * 9 + k;
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      triangle[k] = m[0] * x + m[4] * y + m[8] * z + m[12];
      triangle[k + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      triangle[k + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }

    writer.facet();
  }

  return writer.bytes;
}
