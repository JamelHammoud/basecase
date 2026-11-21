import type { ProjectSettings, ScenePart } from '../types/robotics';

type AppearanceProject = Pick<ProjectSettings, 'cases' | 'study' | 'assignment'>;

export function sceneAppearanceParts(project: AppearanceProject | undefined, parts: ScenePart[]): ScenePart[] {
  const baseline = project?.study?.base;
  const current = Array.isArray(project?.cases) ? project.cases : [];
  const captured = Array.isArray(baseline?.project?.cases) ? baseline.project.cases : [];
  const assigned = project?.assignment?.assignment?.bundle?.case;
  const cases = [...current, ...captured, ...(assigned ? [assigned] : [])];
  const snapshots = cases.flatMap((kase) => {
    const objects = Array.isArray(kase?.world?.objects) ? kase.world.objects : [];

    return objects.flatMap((object) => (object?.geometry ? [object.geometry] : []));
  });

  return [...parts, ...(Array.isArray(baseline?.parts) ? baseline.parts : []), ...snapshots];
}
