import type { Viewport3DHandle } from '../components/Viewport3D';
import { COMPONENT_BY_ID } from '../data/components';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { SweepSpec } from '../three/analysis/sweep';
import { runEngineering, type ServoOutput } from '../utils/engineering';
import type { EngineeringInputs, WalkSim } from '../utils/engineeringTypes';
import { jointsWithChains } from '../assembly/rigJoints';
import { platformBridge } from '../utils/platformBridge';

const isServo = (p: ScenePart) =>
  p.kind === 'component' && !!p.componentId && COMPONENT_BY_ID[p.componentId]?.group === 'Servos';

export interface EngineeringNowInput {
  viewport: Viewport3DHandle | null;
  parts: ScenePart[];
  project: ProjectSettings;
  withSweep: boolean;
  walk?: WalkSim | string;
}

const sweepKey = (spec: SweepSpec) =>
  JSON.stringify([spec.moving, spec.origin, spec.axis, spec.anglesDeg, spec.actuators ?? []]);

async function withSweeps(viewport: Viewport3DHandle, input: EngineeringInputs) {
  const requests = new Map<string, SweepSpec>();

  runEngineering({
    ...input,
    sweep: (spec) => {
      requests.set(sweepKey(spec), spec);

      return [];
    },
  });

  const keys = [...requests.keys()];
  const results = await viewport.sweepClashes([...requests.values()]);
  const byKey = new Map(keys.map((k, i) => [k, results[i] ?? []]));

  return runEngineering({
    ...input,
    sweep: (spec) => byKey.get(sweepKey(spec)) ?? [],
  });
}

export async function engineeringInputs(
  viewport: Viewport3DHandle | null,
  parts: ScenePart[],
  project: ProjectSettings,
): Promise<EngineeringInputs> {
  const servoOutputs: Record<string, ServoOutput> = {};

  for (const p of parts.filter(isServo)) {
    const out = viewport?.servoOutput(p.id);

    if (out) servoOutputs[p.id] = out;
  }

  const chains = project.joints?.length ? await viewport?.fastenerChains() : null;

  return {
    parts,
    project: { ...project, joints: jointsWithChains(project.joints ?? [], parts, chains) },
    measures: (await viewport?.measureParts()) ?? {},
    servoOutputs,
    purchases: await platformBridge.listPurchases(),
  };
}

export async function runEngineeringNow({ viewport, parts, project, withSweep, walk }: EngineeringNowInput) {
  const input: EngineeringInputs = { ...(await engineeringInputs(viewport, parts, project)), walk };

  return withSweep && viewport ? withSweeps(viewport, input) : runEngineering(input);
}
