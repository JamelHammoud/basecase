import '@xyflow/react/dist/style.css';
import { type Connection, type Node, ReactFlow } from '@xyflow/react';
import { useState } from 'react';
import { ContextMenu, type ContextMenuEntry, PlusIcon, deleteEntry } from '../../design-system';
import type { Flow, NodeState } from '../../routines/flowTypes';
import type { RoutineError } from '../../routines/schema';
import { AddNode } from './AddNode';
import { canvasEdges, canvasNodes, nodeHeights } from './canvasModel';
import { useEditorContext } from './editorContext';
import { layoutFlow, nearestSpot, pointSpots } from './flowLayout';
import { RoutineEdge } from './RoutineEdge';
import { RoutineNode } from './RoutineNode';

const NODE_TYPES = { routine: RoutineNode, add: AddNode };
const EDGE_TYPES = { routine: RoutineEdge };
const PRO = { hideAttribution: true };
const PICKABLE = new Set(['base', 'watcher', 'reaction', 'do', 'say', 'infer', 'ask', 'if', 'wait', 'together']);

interface RoutineFlowProps {
  flow: Flow;
  states: Record<string, NodeState>;
  errors: RoutineError[];
}

interface Dragged {
  id: string;
  x: number;
  y: number;
}

export function RoutineFlow({ flow, states, errors }: RoutineFlowProps) {
  const { editor, points, trainable } = useEditorContext();
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const list = [...points.values()];
  const placed = layoutFlow(flow, list, nodeHeights(flow, errors, trainable));
  const baseId = flow.nodes.find((n) => n.kind === 'base')?.id ?? '';
  const kindOf = (id: string) => flow.nodes.find((n) => n.id === id)?.kind ?? '';
  const nodes = canvasNodes({ flow, placed, points: list, states, errors }).map((n) =>
    dragged?.id === n.id ? { ...n, position: { x: dragged.x, y: dragged.y } } : n,
  );

  const drop = (node: Node) => {
    const size = placed.get(node.id);
    const at = { x: node.position.x + (size?.width ?? 0) / 2, y: node.position.y + (size?.height ?? 0) / 2 };
    const spots = pointSpots(placed, list).filter((s) => s.point.from !== node.id && s.point.to !== node.id);
    const spot = nearestSpot(spots, at);

    setDragged(null);

    if (spot) editor.move(node.id, spot.point.at);
  };

  const openMenu = (e: React.MouseEvent, node: Node) => {
    const kind = kindOf(node.id);

    if (!PICKABLE.has(kind)) return;

    e.preventDefault();
    editor.select(node.id);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Add Step After', icon: <PlusIcon className="w-4 h-4" />, onSelect: () => editor.addAfter(node.id) },
        ...(kind === 'base' ? [] : [{ divider: true as const }, deleteEntry(() => editor.remove(node.id), '⌫')]),
      ],
    });
  };

  const connect = (c: Connection) => {
    if (c.source && c.target && c.source !== c.target) editor.connect(c.source, c.target, c.sourceHandle ?? null);
  };

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={canvasEdges(flow, list, baseId)}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        colorMode="dark"
        fitView
        minZoom={0.1}
        nodesConnectable
        onConnect={connect}
        onNodeClick={(_, node) => editor.select(PICKABLE.has(kindOf(node.id)) ? node.id : null)}
        onPaneClick={() => editor.select(null)}
        onNodeDrag={(_, node) => setDragged({ id: node.id, x: node.position.x, y: node.position.y })}
        onNodeDragStop={(_, node) => drop(node)}
        onNodeContextMenu={openMenu}
        proOptions={PRO}
        style={{ background: 'transparent' }}
      />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </>
  );
}
