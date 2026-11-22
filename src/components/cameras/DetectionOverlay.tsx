import React, { useSyncExternalStore } from 'react';
import type { CameraVision } from '../../cameras/scopedVision';
import { DetectionBoxes } from './DetectionBoxes';
import { RegionShapes } from './RegionShapes';

export const DetectionOverlay: React.FC<{ camera: string; mirrorText?: boolean; vision: CameraVision }> = ({
  camera,
  mirrorText,
  vision,
}) => {
  const { cameraVision, cameraVisionError, onCameraVision, cameraRegions, onCameraRegions } = vision;
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

  const regions = useSyncExternalStore(
    onCameraRegions,
    () => cameraRegions(camera),
    () => undefined,
  );

  return (
    <>
      <DetectionBoxes result={result} mirrorText={mirrorText} ids={!!regions} />
      {regions && <RegionShapes regions={regions} tracking={result?.tracking} mirrorText={mirrorText} />}
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
