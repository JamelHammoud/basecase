import { useEffect, useRef, useState } from 'react';
import LabelFrameImage from './LabelFrameImage';
import type { LabelEditor } from './useLabelEditor';
import type { LabelDrawing } from './useLabelDrawing';
import LabelOverlay from './LabelOverlay';

export default function FrameLabelCanvas({ editor, drawing }: { editor: LabelEditor; drawing: LabelDrawing }) {
  const canvas = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);
  const frame = editor.frame;

  useEffect(() => {
    const node = canvas.current;

    if (!node || !frame) return;

    const observer = new ResizeObserver(([entry]) =>
      setScale(Math.max(frame.width / entry.contentRect.width, frame.height / entry.contentRect.height)),
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [frame]);

  if (!frame) return <div className="flex-1" />;

  const points = drawing.points;

  return (
    <svg
      ref={canvas}
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      role="img"
      aria-label="Frame labels"
      tabIndex={0}
      className="block w-full h-full min-h-0 touch-none outline-none"
      style={{ cursor: editor.tool === 'select' ? 'default' : 'crosshair' }}
      onPointerDown={drawing.down}
      onPointerMove={drawing.move}
      onPointerUp={drawing.up}
      onPointerCancel={drawing.reset}
    >
      <LabelFrameImage frame={frame} />
      {frame.annotations.map((label) => (
        <LabelOverlay
          key={label.instance}
          label={label}
          selected={label.instance === editor.selected}
          tool={editor.tool}
          scale={scale}
          name={editor.set.classes.find((category) => category.id === label.classId)?.name ?? ''}
        />
      ))}
      {points.length === 2 && editor.tool === 'box' && (
        <rect
          x={Math.min(points[0][0], points[1][0])}
          y={Math.min(points[0][1], points[1][1])}
          width={Math.abs(points[0][0] - points[1][0])}
          height={Math.abs(points[0][1] - points[1][1])}
          fill="none"
          stroke="#0d99ff"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {points.length > 0 && editor.tool === 'polygon' && (
        <polyline
          points={points.map((point) => point.join(',')).join(' ')}
          fill="none"
          stroke="#0d99ff"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
