import { useState } from 'react';
import type { Vec2 } from '../../utils/linkage';

export interface SketchPathEditor {
  points: Vec2[];
  onChange: (points: Vec2[]) => void;
  undo: () => void;
  redo: () => void;
}

export function usePathHistory(points: Vec2[], setPoints: (points: Vec2[]) => void): SketchPathEditor {
  const [past, setPast] = useState<Vec2[][]>([]);
  const [future, setFuture] = useState<Vec2[][]>([]);

  const onChange = (next: Vec2[]) => {
    setPast([...past, points]);
    setFuture([]);
    setPoints(next);
  };

  const undo = () => {
    if (!past.length) return;

    setPast(past.slice(0, -1));
    setFuture([points, ...future]);
    setPoints(past[past.length - 1]);
  };

  const redo = () => {
    if (!future.length) return;

    setPast([...past, points]);
    setFuture(future.slice(1));
    setPoints(future[0]);
  };

  return { points, onChange, undo, redo };
}
