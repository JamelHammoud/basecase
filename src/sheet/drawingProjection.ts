import { BufferGeometry, EdgesGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { ShapeSolid } from '../three/analysis/shapeSolid';
import { edgeVisibility, type ProjectionAxes } from './drawingVisibility';
import { DRAWING_LIMITS, type DrawingLine, type DrawingPoint, type DrawingView } from './drawingTypes';

const AXES: Record<DrawingView['name'], ProjectionAxes> = {
  front: { u: 0, v: 1, depth: 2, sign: 1 },
  top: { u: 0, v: 2, depth: 1, sign: 1 },
  right: { u: 2, v: 1, depth: 0, sign: -1 },
};

function project(point: Vector3, axes: ProjectionAxes, extent: number): DrawingPoint {
  const u = point.getComponent(axes.u);

  return [axes.sign > 0 ? u : extent - u, point.getComponent(axes.v)];
}

function viewOf(solid: ShapeSolid, edges: Float32Array, name: DrawingView['name']): DrawingView {
  const axes = AXES[name];
  const a = new Vector3();
  const b = new Vector3();
  const extent = solid.box.max.getComponent(axes.u);
  const height = solid.box.max.getComponent(axes.v);
  const unique = new Map<string, DrawingLine>();
  const visible = edgeVisibility(solid, axes);

  for (let i = 0; i < edges.length; i += 6) {
    a.fromArray(edges, i);
    b.fromArray(edges, i + 3);

    const p = project(a, axes, extent);
    const q = project(b, axes, extent);

    if (name === 'top') {
      p[1] = height - p[1];
      q[1] = height - q[1];
    }

    if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= DRAWING_LIMITS.toleranceMm) continue;

    for (const segment of visible(a, b)) {
      const interpolate = (t: number): DrawingPoint => [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      const start = interpolate(segment.start);
      const end = interpolate(segment.end);
      const key = [start, end]
        .map((v) => v.map((n) => n.toFixed(4)).join(','))
        .sort()
        .join('|');
      const previous = unique.get(key);

      if (!previous || !segment.hidden) unique.set(key, { a: start, b: end, hidden: segment.hidden });

      if (unique.size > DRAWING_LIMITS.lines) throw new Error('Reduce the drawing to at most 12,000 edges per view.');
    }
  }

  return { name, lines: [...unique.values()] };
}

export function drawingViews(triangles: Float32Array): DrawingView[] {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(triangles, 3));
  const edgeGeometry = new EdgesGeometry(geometry, 0.1);
  const edges = edgeGeometry.getAttribute('position').array as Float32Array;
  const solid = new ShapeSolid(triangles);

  try {
    if (edges.length / 6 > DRAWING_LIMITS.lines)
      throw new Error('Reduce the drawing to at most 12,000 edges per view.');

    return (['front', 'top', 'right'] as const).map((name) => viewOf(solid, edges, name));
  } finally {
    solid.dispose();
    geometry.dispose();
    edgeGeometry.dispose();
  }
}
