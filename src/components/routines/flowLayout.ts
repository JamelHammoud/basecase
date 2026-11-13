import dagre from '@dagrejs/dagre';
import type { InsertPoint } from '../../routines/edit';
import type { Flow } from '../../routines/flowTypes';

export const NODE_WIDTH = 196;
export const NODE_HEIGHT = 56;
export const END_SIZE = 14;
export const ADD_SIZE = 28;
export const ADD_LABELLED_WIDTH = 60;

export interface Placed {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Sized {
  id: string;
  width: number;
  height: number;
}

export const addNodeId = (point: InsertPoint) => `add:${point.key}`;

export const attachedPoints = (points: readonly InsertPoint[]) => points.filter((p) => p.to === null);

export function nodeSize(flow: Flow, id: string, height = NODE_HEIGHT): Sized {
  const end = flow.nodes.find((n) => n.id === id)?.kind === 'end';

  return { id, width: end ? END_SIZE : NODE_WIDTH, height: end ? END_SIZE : height };
}

export function addSize(point: InsertPoint): Sized {
  const labelled = point.kind === 'then' || point.kind === 'else';

  return { id: addNodeId(point), width: labelled ? ADD_LABELLED_WIDTH : ADD_SIZE, height: ADD_SIZE };
}

export function layoutFlow(
  flow: Flow,
  points: readonly InsertPoint[] = [],
  heights: ReadonlyMap<string, number> = new Map(),
): Map<string, Placed> {
  const g = new dagre.graphlib.Graph();
  const attached = attachedPoints(points);

  g.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 44, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of flow.nodes) g.setNode(n.id, nodeSize(flow, n.id, heights.get(n.id)));

  for (const p of attached) g.setNode(addNodeId(p), addSize(p));

  for (const e of flow.edges) g.setEdge(e.from, e.to);

  for (const p of attached) g.setEdge(p.from, addNodeId(p));

  dagre.layout(g);

  return new Map(
    g.nodes().map((id) => {
      const { x, y, width, height } = g.node(id);

      return [id, { id, x: x - width / 2, y: y - height / 2, width, height }];
    }),
  );
}

export interface PointSpot {
  point: InsertPoint;
  x: number;
  y: number;
}

const centre = (p: Placed) => ({ x: p.x + p.width / 2, y: p.y + p.height / 2 });

export function pointSpots(placed: Map<string, Placed>, points: readonly InsertPoint[]): PointSpot[] {
  return points.flatMap((point) => {
    const target = placed.get(point.to ?? addNodeId(point));
    const source = placed.get(point.from);

    if (!target || !source) return [];

    if (point.to === null) return [{ point, ...centre(target) }];

    const a = centre(source);
    const b = centre(target);

    return [{ point, x: (a.x + b.x) / 2, y: (source.y + source.height + target.y) / 2 }];
  });
}

const DROP_RADIUS = 90;

export function nearestSpot(spots: readonly PointSpot[], at: { x: number; y: number }): PointSpot | null {
  let best: PointSpot | null = null;
  let bestDistance = DROP_RADIUS;

  for (const spot of spots) {
    const distance = Math.hypot(spot.x - at.x, spot.y - at.y);

    if (distance < bestDistance) {
      best = spot;
      bestDistance = distance;
    }
  }

  return best;
}
