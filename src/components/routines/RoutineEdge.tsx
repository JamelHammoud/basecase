import { BaseEdge, type Edge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@xyflow/react';
import type { InsertPoint } from '../../routines/edit';
import type { FlowEdgeKind } from '../../routines/flowTypes';
import { InsertButton } from './InsertButton';

export interface RoutineEdgeData extends Record<string, unknown> {
  kind: FlowEdgeKind | 'add';
  main: boolean;
  point: InsertPoint | null;
}

const DASHED: ReadonlySet<RoutineEdgeData['kind']> = new Set(['timeout', 'fail', 'add']);

export function RoutineEdge(props: EdgeProps<Edge<RoutineEdgeData>>) {
  const { id, source, target, data, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const kind = data?.kind ?? 'next';
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const style = {
    stroke: kind === 'trigger' ? 'rgba(13,153,255,0.6)' : 'rgba(255,255,255,0.3)',
    strokeWidth: 1.5,
    strokeDasharray: DASHED.has(kind) && !data?.main ? '4 4' : undefined,
  };
  const point = data?.point;
  const edge = <BaseEdge id={id} path={path} style={style} />;

  return (
    <>
      {kind === 'add' ? (
        <g>{edge}</g>
      ) : (
        <g data-flow-edge="" data-from={source} data-to={target} data-kind={kind}>
          {edge}
        </g>
      )}
      {point && (
        <EdgeLabelRenderer>
          <div
            className="absolute"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'none' }}
          >
            <InsertButton point={point} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
