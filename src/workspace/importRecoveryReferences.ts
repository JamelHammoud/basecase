import { RECOVERY_ERRORS } from '../utils/sketch/recoveryErrors';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { surfaceOperands } from '../booleans/operands';

export function validateRecoveryReferences(parts: ScenePart[], source: ScenePart, project: ProjectSettings) {
  const flat = surfaceOperands(parts);

  if (flat.filter((part) => part.id === source.id).length !== 1) throw new Error(RECOVERY_ERRORS.references);

  const references = flat.some(
    (part) =>
      part.sketch?.support?.partId === source.id ||
      part.mates?.some((mate) => mate.target === source.id) ||
      part.mirrorOf?.id === source.id,
  );

  if (
    references ||
    source.robotLink ||
    source.jointId ||
    project.joints?.some((joint) => joint.frame?.part === source.id)
  )
    throw new Error(RECOVERY_ERRORS.references);

  if (
    project.wiring?.some(
      (route) =>
        route.from.partId === source.id ||
        route.to.partId === source.id ||
        route.anchors?.some((anchor) => anchor.partId === source.id),
    ) ||
    project.electronicsBoard?.partId === source.id
  )
    throw new Error(RECOVERY_ERRORS.references);

  if (!parts.includes(source)) throw new Error(RECOVERY_ERRORS.source);
}
