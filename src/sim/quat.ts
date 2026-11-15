export type Q = ArrayLike<number>;

export const conj = (q: Q) => [q[0], -q[1], -q[2], -q[3]];

export const quatMul = (a: Q, b: Q) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

export const rotate = (q: Q, v: ArrayLike<number>, out = [0, 0, 0], offset = 0) => {
  const w = q[0];
  const x = q[1];
  const y = q[2];
  const z = q[3];
  const a = v[offset];
  const b = v[offset + 1];
  const c = v[offset + 2];
  const tw = w * 0 - x * a - y * b - z * c;
  const tx = w * a + x * 0 + y * c - z * b;
  const ty = w * b - x * c + y * 0 + z * a;
  const tz = w * c + x * b - y * a + z * 0;

  out[0] = tw * -x + tx * w + ty * -z - tz * -y;
  out[1] = tw * -y - tx * -z + ty * w + tz * -x;
  out[2] = tw * -z + tx * -y - ty * -x + tz * w;

  return out;
};

export function axisAngle(q: Q): [number, number, number] {
  const s = q[0] < 0 ? -1 : 1;
  const w = Math.min(1, Math.abs(q[0]));
  const n = Math.hypot(q[1], q[2], q[3]);

  if (n < 1e-9) return [0, 0, 0];

  const angle = 2 * Math.atan2(n, w);

  return [(s * q[1] * angle) / n, (s * q[2] * angle) / n, (s * q[3] * angle) / n];
}
