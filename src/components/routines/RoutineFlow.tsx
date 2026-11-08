import '@xyflow/react/dist/style.css';
import { type Edge, type Node, type NodeHandle, Position, ReactFlow } from '@xyflow/react';
import type { Flow, NodeState } from '../../routines/flowTypes';
import type { RoutineError } from '../../routines/schema';
import { END_SIZE, layoutFlow, NODE_HEIGHT, NODE_WIDTH } from './flowLayout';
import { RoutineEdge, type RoutineEdgeData } from './RoutineEdge';
import { RoutineNode, type RoutineNodeData } from './RoutineNode';

const NODE_TYPES = { routine: RoutineNode };
const EDGE_TYPES = { routine: RoutineEdge };
const PRO = { hideAttribution: true };

const handlesFor = (width: number, height: number): NodeHandle[] => [
  { type: 'target', position: Position.Top, x: width / 2, y: 0, width: 1, height: 1 },
  { type: 'source', position: Position.Bottom, x: width / 2, y: height, width: 1, height: 1 },
];

interface RoutineFlowProps {
  flow: Flow;
  states: Record<string, NodeState>;
  errors: RoutineError[];
  onTrain: (skill: string) => void;
}

export function RoutineFlow({ flow, states, errors, onTrain }: RoutineFlowProps) {
  const placed = new Map(layoutFlow(flow).map((p) => [p.id, p]));
  const nodes: Array<Node<RoutineNodeData>> = flow.nodes.map((node) => {
    const own = errors.filter((e) => e.path === node.id);

    const size = node.kind === 'end' ? END_SIZE : NODE_WIDTH;
    const height = node.kind === 'end' ? END_SIZE : NODE_HEIGHT;

    return {
      id: node.id,
      type: 'routine',
      position: { x: placed.get(node.id)?.x ?? 0, y: placed.get(node.id)?.y ?? 0 },
      width: size,
      height,
      handles: handlesFor(size, height),
      draggable: false,
      selectable: false,
      data: {
        node,
        state: states[node.id] ?? '',
        problems: own.filter((e) => e.code !== 'needs-training').map((e) => e.message),
        needsTraining: own.some((e) => e.code === 'needs-training'),
        onTrain,
      },
    };
  });
  const edges: Array<Edge<RoutineEdgeData>> = flow.edges.map((e, i) => ({
    id: `${e.from}>${e.to}:${e.kind}:${i}`,
    source: e.from,
    target: e.to,
    type: 'routine',
    data: { kind: e.kind },
  }));

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      colorMode="dark"
      fitView
      minZoom={0.1}
      nodesConnectable={false}
      proOptions={PRO}
      style={{ background: 'transparent' }}
    />
  );
}
