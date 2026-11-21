import type { Vec2 } from './types';

type Edge = [Vec2, Vec2];

interface PreparedEdge {
  edge: Edge;
  x: number;
  y: number;
  start: string;
  end: string;
}

export const pointKey = (p: Vec2) => `${Math.round(p[0] / 1e-3)},${Math.round(p[1] / 1e-3)}`;

function prepare(edge: Edge): PreparedEdge {
  const [p, q] = edge;
  const length = Math.hypot(q[0] - p[0], q[1] - p[1]);

  return {
    edge,
    x: (q[0] - p[0]) / length,
    y: (q[1] - p[1]) / length,
    start: pointKey(p),
    end: pointKey(q),
  };
}

function joinPair(a: PreparedEdge, b: PreparedEdge): Edge | null {
  if (Math.abs(a.x * b.y - a.y * b.x) > 1e-6) return null;

  if (a.start === b.start) return [a.edge[1], b.edge[1]];

  if (a.start === b.end) return [a.edge[1], b.edge[0]];

  if (a.end === b.start) return [a.edge[0], b.edge[1]];

  if (a.end === b.end) return [a.edge[0], b.edge[0]];

  return null;
}

function joinStep(edges: PreparedEdge[]): boolean {
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const joined = joinPair(edges[i], edges[j]);

      if (!joined) continue;

      edges.splice(j, 1);
      edges[i] = prepare(joined);

      return true;
    }
  }

  return false;
}

export function mergeCollinear(edges: Edge[]): Edge[] {
  const out = edges.map(prepare);

  while (joinStep(out));

  return out.map((entry) => entry.edge);
}
