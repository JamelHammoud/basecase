import type { ParameterDesign } from '../utils/designParameters/mutations';
import type { ProjectSettings, ScenePart } from '../types/robotics';

export interface FitVariantSource {
  scene: string;
  project: ProjectSettings;
  source: ParameterDesign;
}

interface CurrentSource {
  scene: string;
  active: boolean;
  parts: ScenePart[];
  project: ProjectSettings;
}

export function fitVariantCurrent(saved: FitVariantSource, current: CurrentSource) {
  return (
    current.active &&
    current.scene === saved.scene &&
    current.project === saved.project &&
    current.parts === saved.source.parts &&
    current.project.designParameters === saved.source.parameters
  );
}
