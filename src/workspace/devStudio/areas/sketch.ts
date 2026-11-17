import { sketchSupportMeasurements } from '../../sketchSupportMeasurements';
import type { ScenePart } from '../../../types/robotics';
import type { Vec2 } from '../../../utils/linkage';
import type { Studio } from '../types';

export default function sketchStudio(studio: Studio) {
  return {
    sketchSupportMeasurements: (parts: ScenePart[]) => sketchSupportMeasurements(parts),
    selectFace: (partId: string, normal: [number, number, number]) =>
      studio().core.sketching.selectFace(partId, normal),
    sketchPath: (points: Vec2[]) => studio().core.sketching.setPath(points),
  };
}
