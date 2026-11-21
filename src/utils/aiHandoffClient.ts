import { geometryWorker } from '../three/geometryWorker';
import type { SceneAnnotation, ScenePart } from '../types/robotics';
import { handoffPart } from './aiHandoffInput';
import { timeSlicer } from './yieldToMain';

export async function handoffInWorker(input: {
  name: string;
  goal: string;
  parts: ScenePart[];
  annotations: SceneAnnotation[];
  markdownOnly?: boolean;
}) {
  const parts: ScenePart[] = [];
  const breathe = timeSlicer();

  for (const part of input.parts) {
    await breathe();
    parts.push(handoffPart(part));
  }

  return geometryWorker.call('handoff', { ...input, parts });
}
