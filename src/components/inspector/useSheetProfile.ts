import { useEffect, useState } from 'react';
import type { ScenePart } from '../../types/robotics';
import type { MeshMeasure } from '../../three/meshMeasure';
import type { InspectorProps } from './types';

type SheetProfile = NonNullable<MeshMeasure['sheet']>;

interface MeasuredSheet {
  part: ScenePart;
  profile: SheetProfile | null;
}

export function useSheetProfile(part: ScenePart, measurePart: InspectorProps['measurePart']) {
  const [measured, setMeasured] = useState<MeasuredSheet | null>(null);

  useEffect(() => {
    if (part.role !== 'solid' || part.hardware || part.componentId || part.kind === 'image_plane') return;

    let stopped = false;

    void measurePart(part.id).then((measure) => {
      if (!stopped) setMeasured({ part, profile: measure?.sheet ?? null });
    });

    return () => {
      stopped = true;
    };
  }, [part, measurePart]);

  return measured?.part === part ? measured.profile : null;
}
