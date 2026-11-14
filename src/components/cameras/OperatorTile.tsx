import React, { useEffect, useRef } from 'react';
import { enlargeCameraView } from '../../cameras/cameraViewsStore';
import { OPERATOR_KEY, onOperatorPoints, operatorPoints } from '../../cameras/operator/operatorCamera';
import { drawSkeleton } from '../../cameras/operator/skeletonOverlay';
import { useCameraVision } from '../../vision/useCameraVision';
import { VisionOverlay } from './VisionOverlay';
import { tileFrame, tileLabel } from './tileStyle';

interface OperatorTileProps {
  stream: MediaStream;
  label: string | null;
  large: boolean;
  fill?: boolean;
}

export const OperatorTile: React.FC<OperatorTileProps> = ({ stream, label, large, fill }) => {
  useCameraVision(OPERATOR_KEY);

  const video = useRef<HTMLVideoElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const draw = () => {
      if (canvas.current) drawSkeleton(canvas.current, video.current, operatorPoints());
    };

    draw();

    return onOperatorPoints(draw);
  }, [large]);

  return (
    <div data-testid="camera-tile" data-camera={OPERATOR_KEY} className={tileFrame(fill, large)}>
      <button
        type="button"
        aria-label={label ?? undefined}
        onClick={() => enlargeCameraView(OPERATOR_KEY)}
        className="absolute inset-0 block cursor-default -scale-x-100"
      >
        <video ref={video} muted playsInline autoPlay className="absolute inset-0 w-full h-full block object-cover" />
        <canvas ref={canvas} className="absolute inset-0 w-full h-full block" />
      </button>
      <VisionOverlay camera={OPERATOR_KEY} mirrored />
      {label && <span className={tileLabel}>{label}</span>}
    </div>
  );
};
