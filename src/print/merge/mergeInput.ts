import type { ProjectSettings, RobotJoint, ScenePart } from '../../types/robotics';
import { isPrinted, printMaterialOf } from '../../utils/bom';
import { buildRig } from '../../utils/kinematicsRig';
import type { Bed } from '../bed';
import { guidePart } from './mergeGuide';
import type { MergeInput } from './mergeTypes';

function anchorCounts(joints: RobotJoint[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const j of joints)
    for (const id of [...j.parent, ...j.child, ...(j.actuators ?? []), ...(j.frame ? [j.frame.part] : [])])
      counts.set(id, (counts.get(id) ?? 0) + 1);

  return counts;
}

export function mergeInput(parts: ScenePart[], project: ProjectSettings, bed: Bed): MergeInput {
  const joints = project.joints ?? [];
  const { ownerOf } = buildRig(joints, parts);
  const anchors = anchorCounts(joints);
  const candidates = parts
    .filter((p) => p.visible && isPrinted(p) && !p.print?.skip)
    .map((p) => ({
      id: p.id,
      link: ownerOf.get(p.id) ?? '',
      material: printMaterialOf(p, project),
      anchors: anchors.get(p.id) ?? 0,
    }));

  return {
    candidates,
    groups: Object.fromEntries(parts.map((p) => [p.id, p.group?.id])),
    bed,
    guide: { parts: parts.map(guidePart), joints, material: project.material },
  };
}
