import React, { useRef } from 'react';
import { PreviewImage } from '../../design-system';
import type { VisionClass } from '../../vision/frameSet';
import { useFramePreview } from './useFramePreview';

export const DatasetFrameTile: React.FC<{ id: string; classes: VisionClass[] }> = ({ id, classes }) => {
  const ref = useRef<HTMLElement | null>(null);
  const preview = useFramePreview(id, ref);
  const frame = preview?.frame;
  const names = new Map(classes.map((c) => [c.id, c.name]));
  const labels = [...new Set(frame?.annotations.map((annotation) => names.get(annotation.classId)))].filter(Boolean);

  return (
    <figure ref={ref} className="min-w-0 flex flex-col gap-1.5" data-testid="dataset-frame" data-frame={id}>
      <div className="preview relative overflow-hidden" style={{ aspectRatio: '4/3' }}>
        <PreviewImage src={preview?.url} lazy />
        {frame && (
          <svg
            viewBox={`0 0 ${frame.width} ${frame.height}`}
            className="absolute inset-0 w-full h-full pointer-events-none text-[#0d99ff]"
            aria-label={labels.join(', ')}
          >
            {frame.annotations.map((annotation) => (
              <g key={annotation.id}>
                <title>{names.get(annotation.classId)}</title>
                <path
                  d={annotation.polygons.map((polygon) => `M${polygon.join(' ')}Z`).join(' ')}
                  fill="currentColor"
                  fillOpacity={0.15}
                  fillRule="evenodd"
                />
                <rect
                  x={annotation.bbox[0]}
                  y={annotation.bbox[1]}
                  width={annotation.bbox[2]}
                  height={annotation.bbox[3]}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                {Object.entries(annotation.keypoints).map(([name, point]) =>
                  point.visibility > 0 ? (
                    <circle key={name} cx={point.x} cy={point.y} r={2} fill="currentColor" />
                  ) : null,
                )}
              </g>
            ))}
          </svg>
        )}
      </div>
      <figcaption className="min-w-0 min-h-[38px] px-0.5">
        <div className="text-[13px] text-white/90 truncate">{frame?.camera.label}</div>
        <div className="text-[12.5px] text-white/50 truncate">{labels.join(', ')}</div>
        {preview && !frame && <p className="text-[13px] text-red-400">Couldn’t load the image.</p>}
      </figcaption>
    </figure>
  );
};
