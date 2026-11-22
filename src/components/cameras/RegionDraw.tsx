import React, { useEffect, useRef, useState } from 'react';
import type { Point } from '../../vision/tracking/types';

export type RegionKind = 'line' | 'zone';

export interface RegionDrawing {
  kind: RegionKind;
  mirrored?: boolean;
  onLine: (from: Point, to: Point) => void;
  onZone: (points: Point[]) => void;
  onCancel: () => void;
}

const MIN_LINE = 0.02;
const CLOSE_AT = 0.03;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export const RegionDraw: React.FC<RegionDrawing> = ({ kind, mirrored, onLine, onZone, onCancel }) => {
  const layer = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [pointer, setPointer] = useState<Point | null>(null);

  const at = (event: React.PointerEvent | React.MouseEvent): Point => {
    const rect = layer.current!.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);

    return [mirrored ? 1 - x : x, clamp((event.clientY - rect.top) / rect.height)];
  };

  const finishZone = (list: Point[]) => (list.length >= 3 ? onZone(list) : onCancel());

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();

      if (event.key === 'Enter' && kind === 'zone') finishZone(points);
    };

    window.addEventListener('keydown', key);

    return () => window.removeEventListener('keydown', key);
  });

  const down = (event: React.PointerEvent) => {
    event.stopPropagation();

    const point = at(event);

    if (kind === 'line') {
      layer.current?.setPointerCapture(event.pointerId);
      setPoints([point]);
      setPointer(point);

      return;
    }

    const first = points[0];

    if (first && points.length >= 3 && Math.hypot(first[0] - point[0], first[1] - point[1]) < CLOSE_AT) {
      finishZone(points);

      return;
    }

    setPoints([...points, point]);
  };

  const up = (event: React.PointerEvent) => {
    if (kind !== 'line' || !points[0]) return;

    const end = at(event);
    const [start] = points;

    if (Math.hypot(start[0] - end[0], start[1] - end[1]) >= MIN_LINE) onLine(start, end);
    else onCancel();
  };

  const shown = pointer ? [...points, pointer] : points;
  const drawn = kind === 'zone' ? shown : shown.slice(0, 2);

  return (
    <div
      ref={layer}
      data-testid="region-draw"
      data-kind={kind}
      className="absolute inset-0 cursor-crosshair touch-none"
      onPointerDown={down}
      onPointerMove={(event) => setPointer(at(event))}
      onPointerUp={up}
      onDoubleClick={(event) => {
        event.stopPropagation();

        if (kind === 'zone') finishZone(points);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
        <polyline
          points={drawn.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="#0d99ff"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};
