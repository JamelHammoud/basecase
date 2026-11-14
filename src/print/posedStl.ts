import { binaryStl } from '../utils/stlBytes';

export function posedStl(positions: ArrayLike<number>, m: number[]): Uint8Array {
  const out = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];

    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }

  return binaryStl(out);
}
