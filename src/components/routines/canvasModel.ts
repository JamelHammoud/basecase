import { type Edge, type Node, type NodeHandle, Position } from '@xyflow/react';
import type { InsertPoint } from '../../routines/edit';
import type { Flow, FlowEdge, FlowNode, NodeState } from '../../routines/flowTypes';
import type { RoutineError } from '../../routines/schema';
import { addNodeId, attachedPoints, type Placed } from './flowLayout';
import type { RoutineEdgeData } from './RoutineEdge';
import type { RoutineNodeData } from './RoutineNode';

export interface AddNodeData extends Record<string, unknown> {
  point: InsertPoint;
}

export type CanvasNode = Node<RoutineNodeData, 'routine'> | Node<AddNodeData, 'add'>;

const TRAINING = new Set(['needs-training']);
const STEP_KINDS = new Set(['base', 'do', 'say', 'infer', 'ask', 'if', 'wait', 'together']);

function handlesFor(place: Placed, kind: string): NodeHandle[] {
  const { width, height } = place;
  const sides: NodeHandle[] =
    kind === 'if'
      ? [
          { id: 'then', type: 'source', position: Position.Left, x: 0, y: height / 2, width: 1, height: 1 },
          { id: 'else', type: 'source', position: Position.Right, x: width, y: height / 2, width: 1, height: 1 },
        ]
      : [];

  return [
    { type: 'target', position: Position.Top, x: width / 2, y: 0, width: 1, height: 1 },
    { type: 'source', position: Position.Bottom, x: width / 2, y: height, width: 1, height: 1 },
    ...sides,
  ];
}

function nodeErrors(node: FlowNode, errors: readonly RoutineError[]) {
  const own = errors.filter((e) => e.path === node.id);
  const training = (e: RoutineError) =>
    TRAINING.has(e.code) || (e.code === 'unknown-skill' && (node.kind === 'do' || node.kind === 'base'));

  return {
    problems: own.filter((e) => !training(e)).map((e) => e.message),
    needsTraining: own.some(training),
    unproven: own.some((e) => e.code === 'unproven-transition'),
  };
}

export function canvasNodes(options: {
  flow: Flow;
  placed: Map<string, Placed>;
  points: readonly InsertPoint[];
  states: Record<string, NodeState>;
  errors: readonly RoutineError[];
}): CanvasNode[] {
  const { flow, placed, points, states, errors } = options;
  const at = (id: string) => placed.get(id) ?? { id, x: 0, y: 0, width: 0, height: 0 };
  const steps = flow.nodes.map((node): CanvasNode => {
    const place = at(node.id);

    return {
      id: node.id,
      type: 'routine',
      position: { x: place.x, y: place.y },
      width: place.width,
      height: place.height,
      handles: handlesFor(place, node.kind),
      draggable: STEP_KINDS.has(node.kind) && node.kind !== 'base',
      selectable: false,
      data: { node, state: states[node.id] ?? '', ...nodeErrors(node, errors) },
    };
  });
  const adds = attachedPoints(points).map((point): CanvasNode => {
    const place = at(addNodeId(point));

    return {
      id: place.id,
      type: 'add',
      position: { x: place.x, y: place.y },
      width: place.width,
      height: place.height,
      handles: [{ type: 'target', position: Position.Top, x: place.width / 2, y: 0, width: 1, height: 1 }],
      draggable: false,
      selectable: false,
      data: { point },
    };
  });

  return [...steps, ...adds];
}

const sameEdge = (e: FlowEdge, p: InsertPoint) => p.from === e.from && p.to === e.to && p.kind === e.kind;

export function canvasEdges(flow: Flow, points: readonly InsertPoint[], baseId: string): Array<Edge<RoutineEdgeData>> {
  const flowEdges = flow.edges.map((e, i): Edge<RoutineEdgeData> => ({
    id: `${e.from}>${e.to}:${e.kind}:${i}`,
    source: e.from,
    target: e.to,
    type: 'routine',
    data: {
      kind: e.kind,
      main: e.from === baseId && e.kind === 'timeout',
      point: points.find((p) => sameEdge(e, p)) ?? null,
    },
  }));
  const addEdges = attachedPoints(points).map((p): Edge<RoutineEdgeData> => ({
    id: `${p.from}>${addNodeId(p)}`,
    source: p.from,
    target: addNodeId(p),
    type: 'routine',
    data: { kind: 'add', main: false, point: null },
  }));

  return [...flowEdges, ...addEdges];
}
