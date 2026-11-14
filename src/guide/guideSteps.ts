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

let lastApproximate: StepParts | null = null;

function approximateSteps(parts: ScenePart[], project: ProjectSettings, fingerprint: string): string[][] {
  if (lastApproximate?.fingerprint === fingerprint) return lastApproximate.ids;

  const built = parts.filter(isBuilt);
  const ids = built.length
    ? buildGuidePlan(approximateScene('', built, project.joints ?? []), project.material).steps.map((s) => s.partIds)
    : [];

  lastApproximate = { fingerprint, ids };

  return ids;
}

export function guideStepParts(parts: ScenePart[], project: ProjectSettings): string[][] {
  const saved = project.buildGuide?.stepParts;
  const fingerprint = stepsFingerprint(parts, project);

  if (saved && saved.fingerprint === fingerprint) return saved.ids;

  return approximateSteps(parts, project, fingerprint);
}

export function firstSteps(steps: string[][]): Map<string, number> {
  const first = new Map<string, number>();

  steps.forEach((ids, step) => ids.forEach((id) => first.has(id) || first.set(id, step)));

  return first;
}
