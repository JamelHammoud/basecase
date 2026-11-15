import { createContext, use } from 'react';
import { createRecordedCameras } from './recordedCameras';
import { scopedVision } from './scopedVision';

export function createVisionScope(scene: string) {
  const source = (kind: 'simulated' | 'recorded' | 'operator') =>
    scopedVision({ scene, kind, id: crypto.randomUUID() });
  const simulated = source('simulated');
  const recorded = source('recorded');
  const operator = source('operator');

  return { scene, simulated, recorded, operator, playback: createRecordedCameras(recorded) };
}

export type VisionScope = ReturnType<typeof createVisionScope>;
export const VisionScopeContext = createContext<VisionScope | null>(null);

export function useVisionScope() {
  const scope = use(VisionScopeContext);

  if (!scope) throw new Error('Camera vision needs a scene scope.');

  return scope;
}
