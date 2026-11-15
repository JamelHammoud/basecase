import type { V3 } from './material';
import type { HexMesh } from './mesh';

export const unit = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;

  return [v[0] / l, v[1] / l, v[2] / l];
};

export function tangentialForces(mesh: HexMesh, at: Uint8Array, turn: { origin: V3; axis: V3; torqueNmm: number }) {
  const f = new Float64Array(mesh.positions.length);
  const [ax, ay, az] = unit(turn.axis);
  let sum = 0;

  for (let n = 0; n < at.length; n++) {
    if (!at[n]) continue;

    const x = mesh.positions[n * 3] - turn.origin[0];
    const y = mesh.positions[n * 3 + 1] - turn.origin[1];
    const z = mesh.positions[n * 3 + 2] - turn.origin[2];
    const along = x * ax + y * ay + z * az;
    const rx = x - along * ax;
    const ry = y - along * ay;
    const rz = z - along * az;

    sum = sum + rx ** 2 + ry ** 2 + rz ** 2;
    f[n * 3] = ay * rz - az * ry;
    f[n * 3 + 1] = az * rx - ax * rz;
    f[n * 3 + 2] = ax * ry - ay * rx;
  }

  const k = sum > 1e-9 ? turn.torqueNmm / sum : 0;

  for (let n = 0; n < at.length; n++) {
    if (!at[n]) continue;

    for (let d = 0; d < 3; d++) f[n * 3 + d] = k * f[n * 3 + d];
  }

  return f;
}
