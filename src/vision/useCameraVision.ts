import { useEffect } from 'react';
import { startVision } from './client';

export const DEFAULT_VISION_MODEL = 'object-detection';

export function useCameraVision(camera: string, active = true): void {
  useEffect(() => {
    if (!active) return;

    let stopped = false;
    let release: (() => void) | null = null;

    void startVision(camera, DEFAULT_VISION_MODEL).then(
      (stop) => {
        if (stopped) stop();
        else release = stop;
      },
      () => undefined,
    );

    return () => {
      stopped = true;
      release?.();
    };
  }, [camera, active]);
}
