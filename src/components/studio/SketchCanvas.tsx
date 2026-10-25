import React, { useRef } from 'react';
import { MetaLine } from '../../design-system';
import { appendFreehandPoint, holeLoopAt, snapSketchPoint, type SketchPoint, type SketchTool } from './sketchGeometry';
import type { StudioDraft } from './useStudioDraft';

const GRID_LINES = [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4];

const TOOL_HINTS: Record<SketchTool, string> = {
  polygon: 'Click to add corners',
  freehand: 'Drag to draw',
  hole: 'Click to add a hole',
};

const SketchGrid: React.FC = () => (
  <>
    {GRID_LINES.map((g) => (
      <React.Fragment key={g}>
        <line
          x1={g}
          y1={-0.5}
          x2={g}
          y2={0.5}
          stroke={g === 0 ? '#3f3f46' : '#262626'}
          strokeWidth={g === 0 ? '0.004' : '0.0025'}
        />
        <line
          x1={-0.5}
          y1={g}
          x2={0.5}
          y2={g}
          stroke={g === 0 ? '#3f3f46' : '#262626'}
          strokeWidth={g === 0 ? '0.004' : '0.0025'}
        />
      </React.Fragment>
    ))}
  </>
);

const SketchShapes: React.FC<{ draft: StudioDraft }> = ({ draft }) => {
  const { drawMode, outerPoints, holes } = draft;

  return (
    <>
      {drawMode === 'revolve' && (
        <line x1={0} y1={-0.5} x2={0} y2={0.5} stroke="#0d99ff" strokeDasharray="0.02 0.015" strokeWidth="0.006" />
      )}
      {outerPoints.length >= 2 && (
        <polygon
          points={outerPoints.map(([x, z]) => `${x},${z}`).join(' ')}
          fill="#0d99ff"
          fillOpacity={0.18}
          stroke="#0d99ff"
          strokeWidth="0.008"
          strokeLinejoin="round"
        />
      )}
      {holes.map((hole, hIdx) => (
        <polygon
          key={hIdx}
          points={hole.map(([x, z]) => `${x},${z}`).join(' ')}
          fill="#1b1b1b"
          stroke="#ef4444"
          strokeWidth="0.007"
        />
      ))}
      {outerPoints.map(([x, z], idx) => (
        <circle key={idx} cx={x} cy={z} r={0.013} fill="#ffffff" stroke="#0d99ff" strokeWidth="0.006" />
      ))}
    </>
  );
};

export const SketchCanvas: React.FC<{ draft: StudioDraft }> = ({ draft }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { drawTool, outerPoints, holes, snap2D, isDrawingFreehand } = draft;

  const getNormalizedSvgCoords = (e: React.PointerEvent<SVGSVGElement>): SketchPoint => {
    const svg = svgRef.current;

    if (!svg) return [0, 0];

    const rect = svg.getBoundingClientRect();
    const raw: SketchPoint = [(e.clientX - rect.left) / rect.width - 0.5, (e.clientY - rect.top) / rect.height - 0.5];

    return snapSketchPoint(raw, snap2D && drawTool !== 'freehand');
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const point = getNormalizedSvgCoords(e);

    if (drawTool === 'hole') {
      draft.setHoles((prev) => [...prev, holeLoopAt(point)]);

      return;
    }

    if (drawTool === 'polygon') {
      draft.setOuterPoints((prev) => [...prev, point]);

      return;
    }

    draft.setIsDrawingFreehand(true);
    draft.setOuterPoints([point]);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawingFreehand || drawTool !== 'freehand') return;

    const point = getNormalizedSvgCoords(e);

    draft.setOuterPoints((prev) => appendFreehandPoint(prev, point));
  };

  const handlePointerUp = () => {
    if (isDrawingFreehand) draft.setIsDrawingFreehand(false);
  };

  return (
    <div className="relative rounded-xl bg-black/30 ring-1 ring-inset ring-white/[0.06] aspect-square overflow-hidden">
      <svg
        ref={svgRef}
        viewBox="-0.5 -0.5 1 1"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full h-full cursor-crosshair touch-none"
      >
        <SketchGrid />
        <SketchShapes draft={draft} />
      </svg>
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <span className="glass-menu rounded-full px-2.5 h-6 flex items-center text-[12px] text-white/70">
          {TOOL_HINTS[drawTool]}
        </span>
        <span className="glass-menu rounded-full px-2.5 h-6 flex items-center text-[12px] text-white/50 tabular">
          <MetaLine
            items={[
              `${outerPoints.length} points`,
              holes.length > 0 && `${holes.length} ${holes.length === 1 ? 'hole' : 'holes'}`,
            ]}
          />
        </span>
      </div>
    </div>
  );
};
