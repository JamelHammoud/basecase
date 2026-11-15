export type HullPoint = [number, number];

const cross = (o: HullPoint, a: HullPoint, b: HullPoint) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function append(hull: HullPoint[], point: HullPoint, minimum: number): void {
  while (hull.length >= minimum && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();

  hull.push(point);
}

export function convexHull(points: readonly HullPoint[]): HullPoint[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  if (sorted.length < 3) return sorted;

  const hull: HullPoint[] = [];

  for (const point of sorted) append(hull, point, 2);

  const upperMinimum = hull.length + 1;

  for (let i = sorted.length - 2; i >= 0; i--) append(hull, sorted[i], upperMinimum);

  hull.pop();

  return hull;
}
