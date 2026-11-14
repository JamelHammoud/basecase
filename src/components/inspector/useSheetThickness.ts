import { useEffect, useEffectEvent, useState } from 'react';
import { mayBeSheet, sheetProfileOf } from '../../three/sheetProfile';
import type { ScenePart } from '../../types/robotics';
import { shapeKey } from '../../utils/printReport';

export function useSheetThickness(part: ScenePart): number | null {
  const key = `${shapeKey(part)}|${mayBeSheet(part)}`;
  const [found, setFound] = useState<{ key: string; thickness: number | null } | null>(null);
  const current = useEffectEvent(() => part);

  useEffect(() => {
    let live = true;

    void sheetProfileOf(current())
      .catch(() => null)
      .then((profile) => {
        if (live) setFound({ key, thickness: profile?.thickness ?? null });
      });

    return () => {
      live = false;
    };
  }, [key]);

  return found?.key === key ? found.thickness : null;
}
