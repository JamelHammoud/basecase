import React, { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { inkStrokes } from './sketchFile';
import { InkedStroke, SketchPoint, SketchStroke, traceSegment } from './sketchStrokes';

interface LiveStroke {
  pointerId: number;
  left: number;
  top: number;
  ink: InkedStroke;
}

const sampledEvents = (e: React.PointerEvent): PointerEvent[] => {
  const samples = e.nativeEvent.getCoalescedEvents();

  return samples.length ? samples : [e.nativeEvent];
};

const isSameSpot = (a: SketchPoint | undefined, b: SketchPoint) => a?.x === b.x && a?.y === b.y;

function inkSegments(ctx: CanvasRenderingContext2D, stroke: SketchStroke, first: number) {
  ctx.beginPath();

  for (let end = first; end < stroke.length; end++) traceSegment(ctx, stroke, end);

  ctx.stroke();
}

function fitBacking(canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function repaint(canvas: HTMLCanvasElement, strokes: InkedStroke[]) {
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  inkStrokes(ctx, strokes);
}

export function useSketchCanvas(strokes: InkedStroke[], color: string, onStroke: (stroke: InkedStroke) => void) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<LiveStroke | null>(null);

  const paintAll = useEffectEvent(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const live = liveRef.current;

    repaint(canvas, live ? [...strokes, live.ink] : strokes);
  });

  useLayoutEffect(() => paintAll(), [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return undefined;

    const observer = new ResizeObserver(() => {
      fitBacking(canvas);
      paintAll();
    });

    observer.observe(canvas);

    return () => observer.disconnect();
  }, []);

  const addSamples = (e: React.PointerEvent<HTMLCanvasElement>, live: LiveStroke) => {
    const { points } = live.ink;
    const before = points.length;

    for (const sample of sampledEvents(e)) {
      const point = { x: sample.clientX - live.left, y: sample.clientY - live.top };

      if (!isSameSpot(points.at(-1), point)) points.push(point);
    }

    const ctx = e.currentTarget.getContext('2d');

    if (ctx && points.length > before) inkSegments(ctx, points, Math.max(1, before));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || liveRef.current) return;

    const canvas = e.currentTarget;
    const { left, top } = canvas.getBoundingClientRect();
    const start = { x: e.clientX - left, y: e.clientY - top };
    const ctx = canvas.getContext('2d');

    canvas.setPointerCapture(e.pointerId);
    liveRef.current = { pointerId: e.pointerId, left, top, ink: { color, points: [start] } };

    if (ctx) inkStrokes(ctx, [{ color, points: [start] }]);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveRef.current;

    if (live?.pointerId === e.pointerId) addSamples(e, live);
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveRef.current;

    if (live?.pointerId !== e.pointerId) return;

    liveRef.current = null;
    onStroke(live.ink);
  };

  return {
    canvasRef,
    canvasProps: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish },
  };
}
