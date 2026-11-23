import React from 'react';
import { percent } from '../../../electron/percent.mjs';
import type { VisionResult } from '../../vision/types';

const trackOf = (result: VisionResult, detection: VisionResult['detections'][number]) =>
  result.tracking?.tracks.find(
    (track) =>
      !track.coasting &&
      track.label === detection.label &&
      track.box[0] === detection.box[0] &&
      track.box[1] === detection.box[1],
  );

export const DetectionBoxes: React.FC<{ result: VisionResult | null; mirrorText?: boolean; ids?: boolean }> = ({
  result,
  mirrorText,
  ids,
}) => (
  <div
    data-testid="vision-overlay"
    data-timestamp={result?.timestamp}
    className="absolute inset-0 pointer-events-none overflow-hidden"
  >
    {result?.detections.map((detection, index) => (
      <div
        key={`${detection.label}:${index}`}
        data-testid="vision-box"
        data-track={ids ? trackOf(result, detection)?.id : undefined}
        data-label={detection.label}
        data-score={detection.score}
        data-box={detection.box.join(',')}
        className="absolute border-2 border-[#0d99ff]"
        style={{
          left: `${detection.box[0] * 100}%`,
          top: `${detection.box[1] * 100}%`,
          width: `${detection.box[2] * 100}%`,
          height: `${detection.box[3] * 100}%`,
        }}
      >
        <span
          className={`absolute left-0 top-0 max-w-full truncate rounded-br bg-black/80 px-1.5 text-[12px] leading-6 text-white/90 ${mirrorText ? '-scale-x-100' : ''}`}
        >
          {detection.label} {ids && trackOf(result, detection) ? `#${trackOf(result, detection)?.id} ` : ''}
          {percent(detection.score)}
        </span>
      </div>
    ))}
  </div>
);
