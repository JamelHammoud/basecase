import type { ProjectSettings, ScenePart } from '../types/robotics';
import { guideFingerprint } from './guideFingerprint';
import { buildGuidePlan, isBuilt } from './guidePlan';
import { approximateScene } from './guideScene';
import type { GuidePlan } from './guideTypes';

export interface StepParts {
  fingerprint: string;
  ids: string[][];
}

const stepsFingerprint = (parts: ScenePart[], project: ProjectSettings) => guideFingerprint('', parts, project);

export const stepPartsOf = (plan: GuidePlan, parts: ScenePart[], project: ProjectSettings): StepParts => ({
  fingerprint: stepsFingerprint(parts, project),
  ids: plan.steps.map((s) => s.partIds),
});

export function guideStepParts(parts: ScenePart[], project: ProjectSettings): string[][] {
  const saved = project.buildGuide?.stepParts;

  if (saved && saved.fingerprint === stepsFingerprint(parts, project)) return saved.ids;

  const built = parts.filter(isBuilt);

  if (!built.length) return [];

  return buildGuidePlan(approximateScene('', built, project.joints ?? []), project.material).steps.map(
    (s) => s.partIds,
  );
}

export function firstSteps(steps: string[][]): Map<string, number> {
  const first = new Map<string, number>();

  steps.forEach((ids, step) => ids.forEach((id) => first.has(id) || first.set(id, step)));

  return first;
}
