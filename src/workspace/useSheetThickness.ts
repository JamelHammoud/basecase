import { useEffect, useState, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';

const SETTLE_MS = 120;

const found = new WeakMap<ScenePart, number | null>();

export function useSheetThickness(part: ScenePart | null, viewportRef: RefObject<Viewport3DHandle | null>) {
  const [last, setLast] = useState<{ id: string; mm: number | null } | null>(null);

  useEffect(() => {
    if (!part || part.role !== 'solid' || found.has(part)) return;

    let stopped = false;
    const timer = window.setTimeout(async () => {
      const viewport = viewportRef.current;

      if (!viewport) return;

      const measured = await viewport.measureParts([part.id]);
      const mm = measured[part.id]?.sheet?.thicknessMm ?? null;

      found.set(part, mm);

      if (!stopped) setLast({ id: part.id, mm });
    }, SETTLE_MS);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [part, viewportRef]);

  if (!part) return null;

  if (found.has(part)) return found.get(part)!;

  return last?.id === part.id ? last.mm : null;
}
