import { useEffect, useEffectEvent } from 'react';
import { sha256 } from '../cases/tries';
import { loadRecording, loadTries } from '../cases/tryStore';
import { frameVectorsOf } from '../cases/trySearch/clip/tryFrames';
import { registerFrameSource } from '../cases/trySearch/trySearchClient';
import { sceneCamera } from '../datasets/cameras';
import { canExport } from '../datasets/episodes';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';

interface TryFramesOptions {
  sceneId: string;
  sim: Simulation;
  parts: ScenePart[];
  caseId: string | null;
}

export function useTryFrames({ sceneId, sim, parts, caseId }: TryFramesOptions) {
  const frames = useEffectEvent(async (tryId: string) => {
    const model = sim.modelNow();
    const summary = (await loadTries()).find((t) => t.id === tryId);

    if (!model || !summary || summary.caseId !== caseId || summary.modelHash !== (await sha256(model.xml))) return null;

    const recording = await loadRecording(tryId);

    if (!recording || !canExport(recording, model)) return [];

    const world = sim.worldParts;

    return frameVectorsOf({ parts, world, model, recording, camera: sceneCamera(parts, world) });
  });

  useEffect(() => registerFrameSource({ sceneId, frames: (tryId) => frames(tryId) }), [sceneId]);
}
