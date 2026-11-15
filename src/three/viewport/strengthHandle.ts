import { lightenIn, strengthIn } from '../analysis/analysisPool';
import type { SceneShapes } from '../analysis/sceneShapes';
import type { Viewport3DHandle } from './types';

export function strengthHandle(
  restShapes: (ids: string[]) => SceneShapes,
): Pick<Viewport3DHandle, 'strength' | 'lightenPart'> {
  return {
    strength: (jobs) => strengthIn(restShapes([...new Set(jobs.map((j) => j.part))]), jobs),
    lightenPart: (task) => lightenIn(restShapes([task.part]), task),
  };
}
