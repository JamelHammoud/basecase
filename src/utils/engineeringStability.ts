import type { ScenePart } from '../types/robotics';
import type { RobotBody } from './engineeringBody';
import { convexHull, lineDistance, norm, polygonMargin, type V3 } from './engineeringMath';
import type { CheckContext, CheckRow, Stability } from './engineeringTypes';
import { lengthLabel } from './size';

function stabilityStatus({ marginMm, tipDeg, onALine }: Stability): CheckRow['status'] {
  if (onALine) return 'warn';

  if (marginMm <= 0 || tipDeg < 2) return 'fail';

  return tipDeg < 5 ? 'warn' : 'pass';
}

const ROUND_TOLERANCE = 0.1;
const LEVEL_AXIS = 0.98;

function wheelAxle(ctx: CheckContext, p: ScenePart): V3 | undefined {
  const m = ctx.measures[p.id]!;
  const centre = [0, 1, 2].map((k) => (m.min[k] + m.max[k]) / 2) as V3;
  const size = [0, 1, 2].map((k) => m.max[k] - m.min[k]) as V3;

  return ctx.joints
    .filter((j) => j.type === 'revolute' && j.child.includes(p.id))
    .map((j) => ({ j, a: norm(j.axis) }))
    .filter(({ j, a }) => {
      const along = Math.abs(a[0]) >= LEVEL_AXIS ? 0 : 2;
      const across = 2 - along;
      const level = Math.abs(a[along]) >= LEVEL_AXIS;
      const round = Math.abs(size[1] - size[across]) <= ROUND_TOLERANCE * size[1];

      return level && round && lineDistance(centre, j.origin, a) <= ROUND_TOLERANCE * size[1];
    })[0]?.a;
}

function contactPoints(ctx: CheckContext, p: ScenePart): Array<[number, number]> {
  const m = ctx.measures[p.id]!;
  const axle = wheelAxle(ctx, p);

  if (!axle && m.base?.length) return m.base;

  if (!axle)
    return [
      [m.min[0], m.min[2]],
      [m.max[0], m.min[2]],
      [m.max[0], m.max[2]],
      [m.min[0], m.max[2]],
    ];

  const across = Math.abs(axle[0]) > Math.abs(axle[2]) ? 2 : 0;
  const mid = (m.min[across] + m.max[across]) / 2;

  return across === 2
    ? [
        [m.min[0], mid],
        [m.max[0], mid],
      ]
    : [
        [mid, m.min[2]],
        [mid, m.max[2]],
      ];
}

function bodyStability(ctx: CheckContext, b: RobotBody): Stability | undefined {
  if (!b.feet.length || b.mass.grams <= 0) return undefined;

  const hull = convexHull(b.feet.flatMap((p) => contactPoints(ctx, p)));
  const heightMm = b.mass.com[1];
  const onALine = hull.length < 3;
  const marginMm = onALine ? 0 : polygonMargin(hull, [b.mass.com[0], b.mass.com[2]]);

  return { marginMm, heightMm, onALine, tipDeg: (Math.atan2(marginMm, Math.max(1, heightMm)) * 180) / Math.PI };
}

export function stabilityOf(ctx: CheckContext): Stability | undefined {
  const all = ctx.bodies.flatMap((b) => bodyStability(ctx, b) ?? []);

  return all.sort((x, y) => x.marginMm - y.marginMm)[0];
}

export function stabilityRows(ctx: CheckContext): CheckRow[] {
  const s = stabilityOf(ctx);

  return s ? [stabilityRow(s)] : [];
}

function stabilityDetail({ marginMm, heightMm, tipDeg, onALine }: Stability): string {
  if (onALine) return 'Rests on a line with no third contact, so it has to balance itself';

  return marginMm <= 0
    ? `Center of mass is ${lengthLabel(Math.abs(marginMm))} outside the feet: it falls over`
    : `Center of mass ${lengthLabel(marginMm)} inside the outline of the feet, ${lengthLabel(heightMm)} up: tips past ${tipDeg.toFixed(1)}°`;
}

function stabilityRow(s: Stability): CheckRow {
  return { check: 'Standing stability', status: stabilityStatus(s), detail: stabilityDetail(s) };
}
