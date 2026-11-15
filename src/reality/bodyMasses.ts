import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { MeshMeasure } from '../three/meshMeasure';
import type { PartMass } from '../utils/engineeringTypes';
import { buildRig } from '../utils/kinematics';
import { adoptEmbeddedParts } from '../sim/mjcfEmbedded';
import { bodyFitForCalibration, bodyPayloadPosition, rigBodies } from './bodyLayout';
import { activeBodyCalibration } from './history';
import type { BodyFit } from './bodyTypes';
import type { SimBody } from '../sim/mjcfTypes';

function mergePayload(mass: PartMass, grams: number, at: number[]): PartMass {
  const total = mass.grams + grams;

  return {
    ...mass,
    grams: total,
    centroid: mass.centroid.map((v, a) => (v * mass.grams + at[a] * grams) / total) as PartMass['centroid'],
  };
}

const payloadGrams = (fit: BodyFit, body: string, parents: Set<string | undefined>) =>
  parents.has(body) ? 0 : (fit.payloadKg[body] ?? 0) * 1000;

export function bodyMasses(
  masses: PartMass[],
  parts: ScenePart[],
  project: ProjectSettings,
  measures: Record<string, MeshMeasure | undefined>,
): PartMass[] {
  if (!Object.values(project.bodyCalibrations ?? {}).some((history) => activeBodyCalibration(history))) return masses;

  const rig = adoptEmbeddedParts(buildRig(project.joints ?? [], parts), parts, () => null, measures);

  return bodyMassesForBodies(masses, parts, project, rigBodies(rig));
}

export function bodyMassesForBodies(
  masses: PartMass[],
  parts: ScenePart[],
  project: ProjectSettings,
  bodies: SimBody[],
): PartMass[] {
  const { scaled, payloads } = bodyMassProperties(masses, parts, project, bodies);
  const adjusted = new Map(scaled.map((mass) => [mass.id, mass]));

  for (const payload of Object.values(payloads)) {
    const carrier = adjusted.get(payload.carrier);

    if (carrier) adjusted.set(carrier.id, mergePayload(carrier, payload.grams, payload.centroid));
  }

  return [...adjusted.values()];
}

export function bodyMassProperties(
  masses: PartMass[],
  parts: ScenePart[],
  project: ProjectSettings,
  bodies: SimBody[],
) {
  const parents = new Set(bodies.map((body) => body.parent));
  const adjusted = new Map(masses.map((mass) => [mass.id, mass]));
  const payloads: Record<string, { carrier: string; grams: number; centroid: PartMass['centroid'] }> = {};
  const fits = new Map<string, BodyFit | undefined>();

  for (const body of bodies) {
    const robot = body.robot ?? '';

    if (!fits.has(robot)) {
      const calibration = activeBodyCalibration(project.bodyCalibrations?.[robot]);

      fits.set(robot, calibration ? bodyFitForCalibration(calibration, bodies, robot) : undefined);
    }

    const fit = fits.get(robot);

    if (!fit) continue;

    const members = body.parts.filter((id) => adjusted.has(id));
    const scale = fit.massScales[body.name] ?? 1;

    for (const id of members) {
      const mass = adjusted.get(id)!;

      adjusted.set(id, { ...mass, grams: mass.grams * scale });
    }

    const payload = payloadGrams(fit, body.name, parents);
    const carrier = members[0];

    if (carrier && payload > 0)
      payloads[body.name] = { carrier, grams: payload, centroid: bodyPayloadPosition(body, parts) };
  }

  return { scaled: [...adjusted.values()], payloads };
}
