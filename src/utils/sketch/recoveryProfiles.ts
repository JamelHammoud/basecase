import { RECOVERY_ERRORS } from './recoveryErrors';
import { inside, polygonArea } from '../../sheet/profileLoops';
import type { Vec2 } from './types';
import { RECOVERY_LIMITS } from './recoveryTopology';

const cross = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function touches(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));

  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < 0.00005;
}

function intersects(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    touches(a, c, d) ||
    touches(b, c, d) ||
    touches(c, a, b) ||
    touches(d, a, b)
  );
}

export function validateRecoveryProfiles(loops: Vec2[][]) {
  if (loops.reduce((sum, loop) => sum + loop.length, 0) > RECOVERY_LIMITS.points)
    throw new Error(RECOVERY_ERRORS.limit);

  if (loops.some((loop) => loop.length < 3 || Math.abs(polygonArea(loop)) < 0.000001))
    throw new Error(RECOVERY_ERRORS.geometry);

  const edges = loops.flatMap((loop, boundary) =>
    loop.map((a, index) => ({ a, b: loop[(index + 1) % loop.length], boundary, index, count: loop.length })),
  );

  for (let i = 0; i < edges.length; i++) {
    const a = edges[i];

    for (let j = i + 1; j < edges.length; j++) validateEdgePair(a, edges[j]);
  }

  for (let i = 1; i < loops.length; i++) {
    if (!inside(loops[i][0], loops[0]) || loops.slice(1).some((other, j) => j !== i - 1 && inside(loops[i][0], other)))
      throw new Error(RECOVERY_ERRORS.geometry);
  }
}

function validateEdgePair(
  a: { a: Vec2; b: Vec2; boundary: number; index: number; count: number },
  b: { a: Vec2; b: Vec2; boundary: number; index: number; count: number },
) {
  const adjacent =
    a.boundary === b.boundary && ((a.index + 1) % a.count === b.index || (b.index + 1) % b.count === a.index);

  if (!adjacent && intersects(a.a, a.b, b.a, b.b)) throw new Error(RECOVERY_ERRORS.geometry);
}
