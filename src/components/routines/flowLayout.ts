import dagre from '@dagrejs/dagre';
import type { Flow } from '../../routines/flowTypes';

export const NODE_WIDTH = 196;
export const NODE_HEIGHT = 56;
export const END_SIZE = 14;

export interface Placed {
  id: string;
  x: number;
  y: number;
}

export function layoutFlow(flow: Flow): Placed[] {
  const g = new dagre.graphlib.Graph();

  g.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 40, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of flow.nodes) {
    const end = n.kind === 'end';

    g.setNode(n.id, { width: end ? END_SIZE : NODE_WIDTH, height: end ? END_SIZE : NODE_HEIGHT });
  }

  for (const e of flow.edges) g.setEdge(e.from, e.to);

  dagre.layout(g);

  return flow.nodes.map((n) => {
    const { x, y, width, height } = g.node(n.id);

    return { id: n.id, x: x - width / 2, y: y - height / 2 };
  });
}
