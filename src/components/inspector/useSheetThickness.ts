import { useEffect, useEffectEvent, useState } from 'react';
import { mayBeSheet, type SheetThicknessOf } from '../../sheet/sheetThickness';
import type { ScenePart } from '../../types/robotics';
import { shapeKey } from '../../utils/printReport';

export function useSheetThickness(part: ScenePart, thicknessOf: SheetThicknessOf | null): number | null {
  const key = `${shapeKey(part)}|${mayBeSheet(part)}`;
  const [found, setFound] = useState<{ key: string; thickness: number | null } | null>(null);
  const current = useEffectEvent(() => ({ part, thicknessOf }));
  const editing = !thicknessOf;

  useEffect(() => {
    const lookup = current();
    let live = true;

    if (!lookup.thicknessOf) return;

    void lookup
      .thicknessOf(lookup.part)
      .catch(() => null)
      .then((thickness) => {
        if (live) setFound({ key, thickness });
      });

    return () => {
      live = false;
    };
  }, [key, editing]);

  if (editing || found?.key === key) return found?.thickness ?? null;

  return null;
}
