import React, { useSyncExternalStore } from 'react';
import type { CameraVision } from '../../cameras/scopedVision';
import { DetectionBoxes } from './DetectionBoxes';

export const DetectionOverlay: React.FC<{ camera: string; mirrorText?: boolean; vision: CameraVision }> = ({
  camera,
  mirrorText,
  vision,
}) => {
  const { cameraVision, cameraVisionError, onCameraVision } = vision;
  const result = useSyncExternalStore(
    onCameraVision,
    () => cameraVision(camera),
    () => null,
  );
  const error = useSyncExternalStore(
    onCameraVision,
    () => cameraVisionError(camera),
    () => null,
  );

  return (
    <>
      <DetectionBoxes result={result} mirrorText={mirrorText} />
      {error && (
        <span
          role="status"
          className={`pointer-events-none absolute left-1.5 right-1.5 bottom-1.5 rounded-md bg-black/80 px-1.5 text-[12px] leading-6 text-white/90 ${mirrorText ? '-scale-x-100' : ''}`}
        >
          {error}
        </span>
      )}
    </>
  );
};
