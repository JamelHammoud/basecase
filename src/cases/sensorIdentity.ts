import { hashOf } from '../skills/hash';
import type { ScenePart } from '../types/robotics';

export const caseSensorKey = (parts: ScenePart[]) =>
  hashOf(
    parts
      .map((part) => [part.id, part.componentId, part.componentVariant, part.cameraLens])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
