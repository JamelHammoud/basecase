import { useEffect } from 'react';
import type { CaseConsole } from '../cases/console/format';
import { startVision } from '../vision/client';

export function consoleVisionCameras(console: CaseConsole): string[] {
  const matches = JSON.stringify(console).matchAll(/vision\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_*-]+/gu);

  return [...new Set([...matches].map((match) => match[1]))];
}

export function useConsoleVision(console: CaseConsole, active: boolean) {
  const key = consoleVisionCameras(console).join(',');

  useEffect(() => {
    if (!active || !key) return;

    let stopped = false;
    const stops: (() => void)[] = [];

    for (const camera of key.split(',')) {
      void startVision(camera, 'object-detection').then(
        (stop) => {
          if (stopped) stop();
          else stops.push(stop);
        },
        () => undefined,
      );
    }

    return () => {
      stopped = true;
      stops.forEach((stop) => stop());
    };
  }, [key, active]);
}
