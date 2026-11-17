import { measureTriangles } from '../three/meshMeasure';
import { DRAWING_LIMITS } from './drawingTypes';

export function checkDrawingMesh(triangles: Float32Array, name: string) {
  const edgeCounts = new Map<string, { count: number; balance: number }>();
  const key = (at: number) =>
    [triangles[at], triangles[at + 1], triangles[at + 2]].map((n) => Math.round(n * 10000)).join(',');

  if (
    !triangles.length ||
    triangles.length % 9 ||
    triangles.length / 9 > DRAWING_LIMITS.triangles ||
    !triangles.every(Number.isFinite)
  )
    throw new Error(`${name}: use a finite mesh with at most 100,000 triangles.`);

  for (let i = 0; i < triangles.length; i += 9) {
    const points = [key(i), key(i + 3), key(i + 6)];

    if (new Set(points).size !== 3) continue;

    for (let edge = 0; edge < 3; edge++) {
      const a = points[edge];
      const b = points[(edge + 1) % 3];
      const id = [a, b].sort().join('|');
      const previous = edgeCounts.get(id) ?? { count: 0, balance: 0 };
      const count = previous.count + 1;

      if (count > 2) throw new Error(`${name}: repair overlapping mesh faces before exporting drawings.`);

      edgeCounts.set(id, { count, balance: previous.balance + (a < b ? 1 : -1) });
    }
  }

  if (measureTriangles(triangles).volumeMm3 <= 1e-9)
    throw new Error(`${name}: repair the mesh before exporting drawings.`);

  if (!edgeCounts.size || [...edgeCounts.values()].some((edge) => edge.count !== 2 || edge.balance !== 0))
    throw new Error(`${name}: close the mesh before exporting drawings.`);
}
