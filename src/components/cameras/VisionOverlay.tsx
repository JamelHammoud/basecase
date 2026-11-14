import { percent } from '../../../electron/percent.mjs';
import React, { useSyncExternalStore } from 'react';
import { onVisionErrors, visionErrors } from '../../vision/statusStore';
import { onVisionResults, visionResults } from '../../vision/resultStore';

interface VisionOverlayProps {
  camera: string;
  mirrored?: boolean;
  after?: number;
  mediaSource?: string;
}

export const VisionOverlay: React.FC<VisionOverlayProps> = ({
  camera,
  mirrored = false,
  after = -Infinity,
  mediaSource,
}) => {
  const errors = useSyncExternalStore(onVisionErrors, visionErrors, visionErrors);
  const results = useSyncExternalStore(onVisionResults, visionResults, visionResults);
  const detections = results
    .filter(
      (result) =>
        result.camera === camera && result.timestamp >= after && (!mediaSource || result.mediaSource === mediaSource),
    )
    .flatMap((result) => result.detections ?? []);

  return (
    <div data-testid="vision-overlay" className="pointer-events-none absolute inset-0 overflow-hidden">
      {errors[camera] && (
        <span role="status" className="absolute inset-0 flex items-center justify-center px-3 text-[13px] text-red-400">
          {errors[camera]}
        </span>
      )}
      {detections.map((detection, index) => (
        <div
          key={`${detection.classId}-${index}`}
          data-testid="vision-box"
          data-label={detection.label}
          data-score={detection.score}
          className="absolute border-2 border-[#0d99ff]"
          style={{
            left: `${(mirrored ? 1 - detection.box[0] - detection.box[2] : detection.box[0]) * 100}%`,
            top: `${detection.box[1] * 100}%`,
            width: `${detection.box[2] * 100}%`,
            height: `${detection.box[3] * 100}%`,
          }}
        >
          <span className="absolute left-0 top-0 max-w-full bg-[#181818] px-1 text-xs text-white/90 whitespace-nowrap">
            {detection.label} {percent(detection.score)}
          </span>
        </div>
      ))}
    </div>
  );
};
