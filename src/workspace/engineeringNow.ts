import type { Viewport3DHandle } from '../components/Viewport3D';
import { portsOf, worldPort } from '../agent/ports';
import { COMPONENT_BY_ID, actuatorOf } from '../data/components';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { SweepSpec } from '../three/analysis/sweep';
import { runEngineering, type ServoOutput } from '../utils/engineering';
import { SERVO_TOUCH_MM, servoTouchPairs } from '../utils/engineeringHeat';
import type { EngineeringInputs, ServoLine, WalkSim } from '../utils/engineeringTypes';
import { jointsWithChains } from '../assembly/rigJoints';
import { platformBridge } from '../utils/platformBridge';
import { rememberStress } from '../strength/fields';
import type { StrengthJob } from '../strength/types';

const isServo = (p: ScenePart) =>
  p.kind === 'component' && !!p.componentId && COMPONENT_BY_ID[p.componentId]?.group === 'Servos';

const hasActuator = (p: ScenePart) =>
  p.kind === 'component' && !!p.componentId && !!actuatorOf(p.componentId, p.componentVariant);

const hasActuatorOrServo = (p: ScenePart) => isServo(p) || hasActuator(p);

function declaredOutputs(p: ScenePart): ServoLine[] {
  return portsOf(p)
    .filter((port) => port.kind === 'output')
    .map((port) => {
      const at = worldPort(p, port);

      return { point: at.position, axis: at.axis };
    });
}

function servoOutputOf(viewport: Viewport3DHandle | null, p: ScenePart): ServoOutput | undefined {
  const declared = declaredOutputs(p);
  const measured = isServo(p) ? viewport?.servoOutput(p.id) : undefined;

  if (measured) return { ...measured, alternates: declared };

  return declared.length ? { ...declared[0], alternates: declared.slice(1) } : undefined;
}

export interface EngineeringNowInput {
  viewport: Viewport3DHandle | null;
  parts: ScenePart[];
  project: ProjectSettings;
  withSweep: boolean;
  walk?: WalkSim | string;
  supportG?: EngineeringInputs['supportG'];
  printDowns?: EngineeringInputs['printDowns'];
}

const sweepKey = (spec: SweepSpec) =>
  JSON.stringify([spec.moving, spec.origin, spec.axis, spec.anglesDeg, spec.actuators ?? []]);

async function withWorkers(viewport: Viewport3DHandle, input: EngineeringInputs) {
  const sweeps = new Map<string, SweepSpec>();
  const jobs = new Map<string, StrengthJob>();

  runEngineering({
    ...input,
    sweep: (spec) => {
      sweeps.set(sweepKey(spec), spec);

      return [];
    },
    strength: (asked) => {
      asked.forEach((job) => jobs.set(job.key, job));

      return asked.map(() => null);
    },
  });

  const [clashes, readings] = await Promise.all([
    viewport.sweepClashes([...sweeps.values()]),
    viewport.strength([...jobs.values()]),
  ]);
  const clashOf = new Map([...sweeps.keys()].map((k, i) => [k, clashes[i] ?? []]));
  const readingOf = new Map([...jobs.keys()].map((k, i) => [k, readings[i] ?? null]));

  rememberStress(readings);

  return runEngineering({
    ...input,
    sweep: (spec) => clashOf.get(sweepKey(spec)) ?? [],
    strength: (asked) => asked.map((job) => readingOf.get(job.key) ?? null),
  });
}

export async function engineeringInputs(
  viewport: Viewport3DHandle | null,
  parts: ScenePart[],
  project: ProjectSettings,
): Promise<EngineeringInputs> {
  const servoOutputs: Record<string, ServoOutput> = {};

  await viewport?.meshesReady();

  for (const p of parts.filter(hasActuatorOrServo)) {
    const out = servoOutputOf(viewport, p);

    if (out) servoOutputs[p.id] = out;
  }

  const chains = project.joints?.length ? await viewport?.fastenerChains() : null;
  const measures = (await viewport?.measureParts()) ?? {};
  const touching = await viewport?.meshGaps(servoTouchPairs(parts, measures), SERVO_TOUCH_MM);

  return {
    parts,
    chains,
    project: { ...project, joints: jointsWithChains(project.joints ?? [], parts, chains) },
    measures,
    servoOutputs,
    purchases: await platformBridge.listPurchases(),
    servoTouches: touching && [...new Set(touching.map(([id]) => id))],
  };
}

export async function runEngineeringNow(options: EngineeringNowInput) {
  const { viewport, parts, project, withSweep, walk, supportG, printDowns } = options;
  const input: EngineeringInputs = {
    ...(await engineeringInputs(viewport, parts, project)),
    walk,
    supportG,
    printDowns,
  };

  return withSweep && viewport ? withWorkers(viewport, input) : runEngineering(input);
}
