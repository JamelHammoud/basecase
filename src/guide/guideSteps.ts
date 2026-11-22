import type { ProjectSettings, ScenePart } from '../types/robotics';
import { guideFingerprint } from './guideFingerprint';
import { buildGuidePlan, isBuilt } from './guidePlan';
import { approximateScene } from './guideScene';
import type { GuidePlan } from './guideTypes';

export interface StepParts {
  fingerprint: string;
  ids: string[][];
}

export type GuideStepSettings = Pick<ProjectSettings, 'material' | 'infillPct' | 'joints' | 'buildGuide'>;

interface PreparedSteps {
  material: GuideStepSettings['material'];
  infill: number;
  joints: GuideStepSettings['joints'];
  saved: StepParts | undefined;
  steps?: string[][];
  pending?: Promise<string[][]>;
}

const prepared = new WeakMap<ScenePart[], PreparedSteps>();
const ownedSteps = (steps: string[][]) => steps.map((ids) => ids.slice());
const stepsFingerprint = (parts: ScenePart[], project: GuideStepSettings) => guideFingerprint('', parts, project);

function preparedFor(parts: ScenePart[], project: GuideStepSettings): PreparedSteps {
  const saved = project.buildGuide?.stepParts;
  const known = prepared.get(parts);

  if (
    known &&
    known.material === project.material &&
    known.infill === project.infillPct &&
    known.joints === project.joints &&
    known.saved === saved
  )
    return known;

  const entry: PreparedSteps = {
    material: project.material,
    infill: project.infillPct,
    joints: project.joints,
    saved,
    steps: saved && saved.fingerprint === stepsFingerprint(parts, project) ? ownedSteps(saved.ids) : undefined,
  };

  prepared.set(parts, entry);

  return entry;
}

export async function preparedStepParts(
  parts: ScenePart[],
  project: GuideStepSettings,
  prepare: () => Promise<string[][]>,
): Promise<string[][]> {
  const entry = preparedFor(parts, project);

  if (entry.steps) return ownedSteps(entry.steps);

  if (!parts.some(isBuilt)) {
    entry.steps = [];

    return [];
  }

  entry.pending ??= prepare()
    .then((steps) => {
      entry.steps = ownedSteps(steps);

      return entry.steps;
    })
    .finally(() => {
      entry.pending = undefined;
    });

  return ownedSteps(await entry.pending);
}

export const stepPartsOf = (plan: GuidePlan, parts: ScenePart[], project: ProjectSettings): StepParts => ({
  fingerprint: stepsFingerprint(parts, project),
  ids: plan.steps.map((s) => s.partIds),
});

export function guideStepParts(parts: ScenePart[], project: GuideStepSettings): string[][] {
  const entry = preparedFor(parts, project);

  if (entry.steps) return ownedSteps(entry.steps);

  const built = parts.filter(isBuilt);

  if (!built.length) return [];

  const steps = buildGuidePlan(approximateScene('', built, project.joints ?? []), project.material).steps.map(
    (s) => s.partIds,
  );

  entry.steps = steps;

  return ownedSteps(steps);
}

export function firstSteps(steps: string[][]): Map<string, number> {
  const first = new Map<string, number>();

  steps.forEach((ids, step) => ids.forEach((id) => first.has(id) || first.set(id, step)));

  return first;
}
