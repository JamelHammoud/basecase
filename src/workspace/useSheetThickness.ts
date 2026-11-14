import { useEffect, useState, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';

const found = new WeakMap<ScenePart, number | null>();

async function measuredThickness(part: ScenePart, viewport: Viewport3DHandle): Promise<number | null> {
  try {
    const measured = await viewport.measureParts([part.id]);

    return measured[part.id]?.sheet?.thicknessMm ?? null;
  } catch {
    return null;
  }
}

export function useSheetThickness(part: ScenePart | null, viewportRef: RefObject<Viewport3DHandle | null>) {
  const [last, setLast] = useState<{ id: string; mm: number | null } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!part || part.role !== 'solid' || found.has(part) || !viewport) return;

    let stopped = false;

    void measuredThickness(part, viewport).then((mm) => {
      found.set(part, mm);

      if (!stopped) setLast({ id: part.id, mm });
    });

    return () => {
      stopped = true;
    };
  }, [part, viewportRef]);

  if (!part) return null;

  if (found.has(part)) return found.get(part)!;

  return last?.id === part.id ? last.mm : null;
}
