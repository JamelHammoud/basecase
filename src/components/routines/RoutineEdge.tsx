import { BaseEdge, type Edge, type EdgeProps, getSmoothStepPath } from '@xyflow/react';
import type { FlowEdgeKind } from '../../routines/flowTypes';

export interface RoutineEdgeData extends Record<string, unknown> {
  kind: FlowEdgeKind;
}

const DASHED: ReadonlySet<FlowEdgeKind> = new Set(['timeout', 'fail']);

export function RoutineEdge(props: EdgeProps<Edge<RoutineEdgeData>>) {
  const { id, source, target, data, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const kind = data?.kind ?? 'next';
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const style = {
    stroke: kind === 'trigger' ? 'rgba(13,153,255,0.6)' : 'rgba(255,255,255,0.3)',
    strokeWidth: 1.5,
    strokeDasharray: DASHED.has(kind) ? '4 4' : undefined,
  };

  return (
    <g data-flow-edge="" data-from={source} data-to={target} data-kind={kind}>
      <BaseEdge id={id} path={path} style={style} />
    </g>
  );
}
