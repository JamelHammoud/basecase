import type { RobotJoint } from '../types/robotics';
import { count, fmtG } from './engineeringFormat';
import { isLegJoint, robotBodies, type RobotBody } from './engineeringBody';
import { servoMountRows, rangeOfMotionRows } from './engineeringJoints';
import { downstreamOf, massOf, partMasses } from './engineeringMass';
import { budgetRow } from './engineeringBudget';
import { crouchModel } from './engineeringCrouch';
import { heatRows } from './engineeringHeat';
import { powerRows, servoParts, servoSupplyVolts } from './engineeringPower';
import { stabilityOf, stabilityRows } from './engineeringStability';
import { rangeChangeRows } from './engineeringRanges';
import { SIM_MODEL_CHECK, simModelRows } from './engineeringSimModel';
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
  SIM_MODEL_CHECK,
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

const gramsOf = (masses: PartMass[]) => masses.reduce((s, m) => s + m.grams, 0);

function weightRow(all: CheckContext['all'], masses: PartMass[], bodies: RobotBody[]): CheckRow {
  const counted = masses.filter((m) => bodies.some((b) => b.parts.has(m.id)));
  const apart = masses.filter((m) => !counted.includes(m));
  const est = counted.filter((m) => m.source === 'estimate');
  const estimated = est.length ? `. ${est.length} parts estimated from volume (${fmtG(gramsOf(est))})` : '';
  const leftOut = apart.length
    ? `. Leaves out ${count(apart.length, 'part')} off the robot (${fmtG(gramsOf(apart))})`
    : '';

  return {
    check: 'Weight',
    status: est.length ? 'warn' : 'pass',
    detail: `${fmtG(all.grams)}, centre of mass ${Math.round(all.com[1])} mm up${estimated}${leftOut}`,
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

const hasNoFeet = (ctx: CheckContext, b: RobotBody) => {
  const feet = new Set(b.feet.map((p) => p.id));
  const legs = b.joints.filter((j) => j.type === 'revolute' && isLegJoint(j));

  return b.legged && !legs.some((j) => [...downstreamOf(j, ctx.joints)].some((id) => feet.has(id)));
};

function withNoFeetNote(row: CheckRow, floating: RobotBody[]): CheckRow {
  if (!floating.length) return row;

  return {
    ...row,
    status: row.status === 'fail' ? 'fail' : 'warn',
    detail: `${row.detail}. No foot reaches the robot’s lowest point, so standing loads aren’t measured`,
  };
}

export function runEngineering(input: EngineeringInputs): EngineeringReport {
  const { parts, project, measures } = input;
  const joints = project.joints ?? [];
  const masses = partMasses(parts, project, measures);
  const byId = new Map(masses.map((m) => [m.id, m]));
  const bodies = robotBodies({ parts, joints, measures, byId });
  const ctx: CheckContext = {
    input,
    parts,
    project,
    measures,
    joints,
    byPart: new Map(parts.map((p) => [p.id, p])),
    byId,
    all: massOf(
      bodies.flatMap((b) => [...b.parts]),
      byId,
    ),
    onFloor: bodies.flatMap((b) => b.feet),
    servos: servoParts(parts),
    bodies,
  };
  const floating = bodies.filter((b) => hasNoFeet(ctx, b));
  const env = { volts: servoSupplyVolts(ctx), crouch: crouchModel(ctx) };
  const loads = ctx.joints.filter((j) => j.type === 'revolute').map((j) => jointLoad(ctx, j, env));
  const rows: CheckRow[] = [
    weightRow(ctx.all, masses, bodies),
    ...(ctx.joints.length ? [] : [{ check: 'Servo torque', status: 'not run' as const, detail: 'No joints' }]),
    ...(loads.length
      ? [withNoFeetNote(torqueRow(loads, env.crouch.share), floating), ...peakRow(loads, project, input.walk)]
      : []),
    ...jointPartsRows(ctx),
    ...servoMountRows(ctx),
    ...rangeOfMotionRows(ctx),
    ...rangeChangeRows(ctx),
    ...simModelRows(ctx),
    ...powerRows(ctx),
    ...stabilityRows(ctx),
    ...heatRows(ctx),
    budgetRow(ctx),
  ];

  return { rows, joints: loads, massG: ctx.all.grams, com: ctx.all.com, masses, stability: stabilityOf(ctx) };
}
