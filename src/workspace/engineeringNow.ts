import type { Viewport3DHandle } from '../components/Viewport3D';
import { COMPONENT_BY_ID } from '../data/components';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { runEngineering, type ServoOutput } from '../utils/engineering';
import { resolveJoints } from '../utils/kinematics';

const isServo = (p: ScenePart) =>
  p.kind === 'component' && !!p.componentId && COMPONENT_BY_ID[p.componentId]?.group === 'Servos';

export interface EngineeringNowInput {
  viewport: Viewport3DHandle | null;
  parts: ScenePart[];
  project: ProjectSettings;
  withSweep: boolean;
}

export function runEngineeringNow({ viewport, parts, project, withSweep }: EngineeringNowInput) {
  const servoOutputs: Record<string, ServoOutput> = {};

  for (const p of parts.filter(isServo)) {
    const out = viewport?.servoOutput(p.id);

    if (out) servoOutputs[p.id] = out;
  }

  return runEngineering({
    parts,
    project: { ...project, joints: resolveJoints(project.joints ?? [], parts) },
    measures: viewport?.measureParts() ?? {},
    servoOutputs,
    sweep:
      withSweep && viewport
        ? (moving, origin, axis, angles) => viewport.sweepClashes(moving, origin, axis, angles)
        : undefined,
  });
}
