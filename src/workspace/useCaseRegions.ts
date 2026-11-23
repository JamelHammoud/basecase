import { useEffect } from 'react';
import type { ConsoleRegions } from '../cases/console/regions';
import type { RegionEditing } from '../components/cameras/regionMenu';
import type { ConsoleEditing } from './useConsoleEditing';
import type { VisionScope } from '../cameras/visionScope';

export function useCaseRegions(scope: VisionScope, regions: ConsoleRegions | undefined, recorded: readonly string[]) {
  const recordedKey = recorded.join('\n');
  const text = JSON.stringify(regions ?? {});

  useEffect(() => {
    const keys = new Set(recordedKey ? recordedKey.split('\n') : []);
    const applied = Object.entries(JSON.parse(text) as ConsoleRegions).map(([camera, value]) => {
      const vision = (camera === 'operator' && scope.operator) || (keys.has(camera) ? scope.recorded : scope.simulated);

      vision.setCameraRegions(camera, value);

      return () => vision.setCameraRegions(camera, undefined);
    });

    return () => applied.forEach((stop) => stop());
  }, [scope, text, recordedKey]);
}

export const regionEditing = (editing: ConsoleEditing | null): RegionEditing | undefined =>
  editing
    ? {
        current: (camera) => editing.regions?.[camera],
        drawLine: editing.drawLine,
        drawZone: editing.drawZone,
        clear: editing.clearRegions,
      }
    : undefined;
