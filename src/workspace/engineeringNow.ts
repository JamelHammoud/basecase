import type { Viewport3DHandle } from '../components/Viewport3D';
import { COMPONENT_BY_ID } from '../data/components';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { SweepSpec } from '../three/analysis/sweep';
import { runEngineering, type ServoOutput } from '../utils/engineering';
import type { EngineeringInputs } from '../utils/engineeringTypes';
import { resolveJoints } from '../utils/kinematics';

const isServo = (p: ScenePart) =>
  p.kind === 'component' && !!p.componentId && COMPONENT_BY_ID[p.componentId]?.group === 'Servos';

export interface EngineeringNowInput {
  viewport: Viewport3DHandle | null;
  parts: ScenePart[];
  project: ProjectSettings;
  withSweep: boolean;
}

const sweepKey = (spec: SweepSpec) => JSON.stringify([spec.moving, spec.origin, spec.axis, spec.anglesDeg]);

async function withSweeps(viewport: Viewport3DHandle, input: EngineeringInputs) {
  const requests = new Map<string, SweepSpec>();

  runEngineering({
    ...input,
    sweep: (moving, origin, axis, anglesDeg) => {
      const spec = { moving, origin, axis, anglesDeg };

      requests.set(sweepKey(spec), spec);

      return [];
    },
  });

  const keys = [...requests.keys()];
  const results = await viewport.sweepClashes([...requests.values()]);
  const byKey = new Map(keys.map((k, i) => [k, results[i] ?? []]));

  return runEngineering({
    ...input,
    sweep: (moving, origin, axis, anglesDeg) => byKey.get(sweepKey({ moving, origin, axis, anglesDeg })) ?? [],
  });
}

export async function runEngineeringNow({ viewport, parts, project, withSweep }: EngineeringNowInput) {
  const servoOutputs: Record<string, ServoOutput> = {};

  for (const p of parts.filter(isServo)) {
    const out = viewport?.servoOutput(p.id);

    if (out) servoOutputs[p.id] = out;
  }

  const input: EngineeringInputs = {
    parts,
    project: { ...project, joints: resolveJoints(project.joints ?? [], parts) },
    measures: (await viewport?.measureParts()) ?? {},
    servoOutputs,
  };

  return withSweep && viewport ? withSweeps(viewport, input) : runEngineering(input);
}
