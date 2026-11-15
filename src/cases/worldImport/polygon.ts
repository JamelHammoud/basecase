import { ShapeUtils, Vector2, Vector3 } from 'three';
import { refuse } from '../validate';

function polygonNormal(points: number[][]): Vector3 {
  const normal = new Vector3();

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];

    normal.x += (a[1] - b[1]) * (a[2] + b[2]);
    normal.y += (a[2] - b[2]) * (a[0] + b[0]);
    normal.z += (a[0] - b[0]) * (a[1] + b[1]);
  }

  return normal;
}

function turn(origin: Vector2, first: Vector2, second: Vector2): number {
  return (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x);
}

function crossed(points: Vector2[], i: number, j: number): boolean {
  if (i === j || (i + 1) % points.length === j || (j + 1) % points.length === i) return false;

  const a = points[i];
  const b = points[(i + 1) % points.length];
  const c = points[j];
  const d = points[(j + 1) % points.length];

  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
    Math.max(c.y, d.y) < Math.min(a.y, b.y)
  )
    return false;

  return turn(a, b, c) * turn(a, b, d) <= 0 && turn(c, d, a) * turn(c, d, b) <= 0;
}

export function triangulatePolygon(points: number[][]): number[][] {
  if (points.length === 3) return [[0, 1, 2]];

  const normal = polygonNormal(points);
  const length = normal.length();

  if (!length) return refuse('OBJ', 'has a degenerate face');

  normal.normalize();

  const origin = new Vector3().fromArray(points[0]);
  const axes = normal.toArray().map(Math.abs);
  const dropped = axes.indexOf(Math.max(...axes));
  const flat = points.map((point) => new Vector2().fromArray(point.filter((_, i) => i !== dropped)));
  const tolerance = Math.sqrt(length) * 1e-5;
  const offPlane = points.some((point) => Math.abs(new Vector3().fromArray(point).sub(origin).dot(normal)) > tolerance);
  const selfCrossed = flat.some((_, i) => flat.some((_, j) => j > i && crossed(flat, i, j)));

  if (offPlane || selfCrossed) return refuse('OBJ', 'needs simple planar faces');

  const triangles = ShapeUtils.triangulateShape(flat, []);

  if (triangles.length !== points.length - 2) return refuse('OBJ', 'has a face that cannot be triangulated');

  return triangles.map(([a, b, c]) => {
    const edge = new Vector3().fromArray(points[b]).sub(new Vector3().fromArray(points[a]));
    const other = new Vector3().fromArray(points[c]).sub(new Vector3().fromArray(points[a]));

    return edge.cross(other).dot(normal) >= 0 ? [a, b, c] : [a, c, b];
  });
}
