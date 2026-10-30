import type { RobotJoint } from '../types/robotics';
import { fmtG } from './engineeringFormat';
import { servoMountRows, rangeOfMotionRows } from './engineeringJoints';
import { massOf, partMasses } from './engineeringMass';
import { budgetRow } from './engineeringBudget';
import { crouchModel } from './engineeringCrouch';
import { heatRows, powerRows, servoParts, servoSupplyVolts, stabilityOf, stabilityRows } from './engineeringPower';
import { rangeChangeRows } from './engineeringRanges';
import { jointLoad, peakRow, torqueRow } from './engineeringTorque';
import type { CheckContext, CheckRow, EngineeringInputs, EngineeringReport, PartMass } from './engineeringTypes';

export { rotateEuler } from './engineeringMath';
export { downstreamOf, partMasses } from './engineeringMass';
export { engineeringText } from './engineeringFormat';
export type {
  CheckRow,
  EngineeringInputs,
  EngineeringReport,
  JointLoad,
  PartMass,
  ServoOutput,
} from './engineeringTypes';

export const ENGINEERING_CHECKS = [
  'Weight',
  'Servo torque',
  'Peak torque',
  'Servo alignment',
  'Joint support',
  'Range of motion',
  'Range changes',
  'Servo voltage',
  'Current and runtime',
  'Standing stability',
  'Heat near servos',
  'Budget',
];

function weightRow(all: CheckContext['all'], masses: PartMass[]): CheckRow {
  const est = masses.filter((m) => m.source === 'estimate');
  const estimated = est.length
    ? `. ${est.length} parts estimated from volume (${fmtG(est.reduce((s, m) => s + m.grams, 0))})`
    : '';

  return {
    check: 'Weight',
    status: est.length ? 'warn' : 'pass',
    detail: `${fmtG(all.grams)}, centre of mass ${Math.round(all.com[1])} mm up${estimated}`,
    ids: est.map((m) => m.id),
  };
}

function jointPartsRows(ctx: CheckContext): CheckRow[] {
  const unknownIds = ctx.joints.flatMap((j: RobotJoint) =>
    [...j.parent, ...j.child, ...(j.actuators ?? [])].filter((id) => !ctx.byPart.has(id)),
  );

  if (!unknownIds.length) return [];

  return [
    {
      check: 'Joint parts',
      status: 'fail',
      detail: `Joints name parts that don't exist: ${[...new Set(unknownIds)].join(', ')}`,
    },
  ];
}

export function runEngineering(input: EngineeringInputs): EngineeringReport {
  const { parts, project, measures } = input;
  const masses = partMasses(parts, project, measures);
  const byId = new Map(masses.map((m) => [m.id, m]));
  const ctx: CheckContext = {
    input,
    parts,
    project,
    measures,
    joints: project.joints ?? [],
    byPart: new Map(parts.map((p) => [p.id, p])),
    byId,
    all: massOf(byId.keys(), byId),
    onFloor: parts.filter((p) => p.role === 'solid' && measures[p.id] && measures[p.id]!.min[1] < 2),
    servos: servoParts(parts),
  };
  const env = { volts: servoSupplyVolts(ctx), crouch: crouchModel(ctx) };
  const loads = ctx.joints.filter((j) => j.type === 'revolute').map((j) => jointLoad(ctx, j, env));
  const rows: CheckRow[] = [
    weightRow(ctx.all, masses),
    ...(ctx.joints.length ? [] : [{ check: 'Servo torque', status: 'not run' as const, detail: 'No joints' }]),
    ...(loads.length ? [torqueRow(loads, env.crouch.share), ...peakRow(loads, project, input.walk)] : []),
    ...jointPartsRows(ctx),
    ...servoMountRows(ctx),
    ...rangeOfMotionRows(ctx),
    ...rangeChangeRows(ctx),
    ...powerRows(ctx),
    ...stabilityRows(ctx),
    ...heatRows(ctx),
    budgetRow(ctx),
  ];

  return { rows, joints: loads, massG: ctx.all.grams, com: ctx.all.com, masses, stability: stabilityOf(ctx) };
}
