import type { V3 } from './material';
import type { HexMesh } from './mesh';

export const unit = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;

  return [v[0] / l, v[1] / l, v[2] / l];
};

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const pointOf = (mesh: HexMesh, n: number): V3 => [
  mesh.positions[n * 3],
  mesh.positions[n * 3 + 1],
  mesh.positions[n * 3 + 2],
];

const listed = (at: Uint8Array) => at.reduce<number[]>((out, v, n) => (v ? [...out, n] : out), []);

export function tangentialForces(mesh: HexMesh, at: Uint8Array, turn: { origin: V3; axis: V3; torqueNmm: number }) {
  const f = new Float64Array(mesh.positions.length);
  const a = unit(turn.axis);
  const arms = listed(at).map((n): [number, V3] => {
    const rel = sub(pointOf(mesh, n), turn.origin);
    const along = rel[0] * a[0] + rel[1] * a[1] + rel[2] * a[2];

    return [n, [rel[0] - along * a[0], rel[1] - along * a[1], rel[2] - along * a[2]]];
  });
  const sum = arms.reduce((s, [, r]) => s + r[0] ** 2 + r[1] ** 2 + r[2] ** 2, 0);
  const k = sum > 1e-9 ? turn.torqueNmm / sum : 0;

  for (const [n, r] of arms) {
    const t = cross(a, r);

    for (let d = 0; d < 3; d++) f[n * 3 + d] = k * t[d];
  }

  return f;
}
