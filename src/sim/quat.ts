export type Q = ArrayLike<number>;

export const conj = (q: Q) => [q[0], -q[1], -q[2], -q[3]];

export const quatMul = (a: Q, b: Q) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

export const rotate = (q: Q, v: ArrayLike<number>) => {
  const r = quatMul(quatMul(q, [0, v[0], v[1], v[2]]), conj(q));

  return [r[1], r[2], r[3]];
};

export function axisAngle(q: Q): [number, number, number] {
  const s = q[0] < 0 ? -1 : 1;
  const w = Math.min(1, Math.abs(q[0]));
  const n = Math.hypot(q[1], q[2], q[3]);

  if (n < 1e-9) return [0, 0, 0];

  const angle = 2 * Math.atan2(n, w);

  return [(s * q[1] * angle) / n, (s * q[2] * angle) / n, (s * q[3] * angle) / n];
}
