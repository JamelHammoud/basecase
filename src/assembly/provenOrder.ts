import type { ScenePart } from '../types/robotics';
import type { AssemblyGeometry } from './assemblyGeometry';
import { planRemoval, type RemovalPlan } from './removalOrder';

export interface ProvenOrder {
  assembly: string[];
  unproven: string[];
}

export function provenOrder(plan: RemovalPlan, majors: string[]): ProvenOrder {
  const known = new Set(majors);
  const removed = plan.steps.filter((s) => s.kind !== 'screw').flatMap((s) => s.ids.filter((id) => known.has(id)));

  return { assembly: [...removed].reverse(), unproven: plan.stuckParts };
}

export function provenOrderOf(parts: ScenePart[], geometry: AssemblyGeometry): ProvenOrder {
  const groups = Object.fromEntries(parts.map((p) => [p.id, p.group?.id]));

  return provenOrder(planRemoval(geometry, groups), Object.keys(geometry.moves));
}
