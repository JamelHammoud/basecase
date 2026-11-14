import type { RobotJoint } from '../types/robotics';
import { fmtG } from './engineeringFormat';
import { plural } from '../../electron/plural.mjs';
import { isLegJoint, robotBodies, type RobotBody } from './engineeringBody';
import { servoMountRows, rangeOfMotionRows } from './engineeringJoints';
import { downstreamOf, massOf, partMasses } from './engineeringMass';
import { budgetRow } from './engineeringBudget';
import { crouchModel } from './engineeringCrouch';
import { heatRows } from './engineeringHeat';
import { powerRows, servoParts, servoSupplyVolts } from './engineeringPower';
import { stabilityOf, stabilityRows } from './engineeringStability';
import { rangeChangeRows } from './engineeringRanges';
import { simModelRows } from './engineeringSimModel';
import { servoLookup } from './engineeringEnvelope';
import { jointLoad, peakRow, torqueRow } from './engineeringTorque';
import { payloadRows } from './engineeringPayload';
import { STRENGTH_CHECK, strengthRows } from './engineeringStrength';
import type { CheckContext, CheckRow, EngineeringInputs, EngineeringReport, PartMass } from './engineeringTypes';

export { STRENGTH_CHECK };
export { rotateEuler } from './engineeringMath';
export { downstreamOf, partMasses } from './engineeringMass';
export { engineeringText } from './engineeringFormat';
export type {
  CheckDot,
  CheckRow,
  EngineeringInputs,
  EngineeringReport,
  FindingFix,
  JointLoad,
  PartMass,
  ServoOutput,
} from './engineeringTypes';

export const ENGINEERING_CHECKS = [
  'Weight',
  'Servo torque',
  'Peak torque',
  'Torque estimates',
  'Servo models',
  'Servo alignment',
  'Joint support',
  'Range of motion',
  'Range changes',
  'Servo voltage',
  'Current and runtime',
  'Standing stability',
  'Heat near servos',
  STRENGTH_CHECK,
  'Budget',
];

const gramsOf = (masses: PartMass[]) => masses.reduce((s, m) => s + m.grams, 0);

function weightRow(all: CheckContext['all'], masses: PartMass[], bodies: RobotBody[]): CheckRow {
  const counted = masses.filter((m) => bodies.some((b) => b.parts.has(m.id)));
  const apart = masses.filter((m) => !counted.includes(m));
  const est = counted.filter((m) => m.source === 'estimate');
  const estimated = est.length ? `. ${plural(est.length, 'part')} estimated from volume (${fmtG(gramsOf(est))})` : '';
  const leftOut = apart.length
    ? `. Leaves out ${plural(apart.length, 'part')} off the robot (${fmtG(gramsOf(apart))})`
    : '';

  return {
    check: 'Weight',
    status: est.length ? 'warn' : 'pass',
    detail: `${fmtG(all.grams)}, center of mass ${Math.round(all.com[1])} mm up${estimated}${leftOut}`,
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
      detail: `Joints name parts that don’t exist: ${[...new Set(unknownIds)].join(', ')}`,
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
    detailInItems: false,
  };
}

export function robotWeight(input: Pick<EngineeringInputs, 'parts' | 'project' | 'measures'>) {
  const { parts, project, measures } = input;
  const masses = partMasses(parts, project, measures);
  const byId = new Map(masses.map((m) => [m.id, m]));
  const bodies = robotBodies({ parts, joints: project.joints ?? [], measures, byId });
  const all = massOf(
    bodies.flatMap((b) => [...b.parts]),
    byId,
  );

  return { masses, byId, bodies, all };
}

export function runEngineering(input: EngineeringInputs): EngineeringReport {
  const { parts, project, measures } = input;
  const joints = project.joints ?? [];
  const { masses, byId, bodies, all } = robotWeight(input);
  const ctx: CheckContext = {
    input,
    parts,
    project,
    measures,
    joints,
    byPart: new Map(parts.map((p) => [p.id, p])),
    byId,
    all,
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
      ? [
          withNoFeetNote(torqueRow(loads, env.crouch.share), floating),
          ...peakRow(loads, project, input.walk, servoLookup(ctx.byPart)),
        ]
      : []),
    ...simModelRows(ctx),
    ...payloadRows(ctx, env.volts),
    ...jointPartsRows(ctx),
    ...servoMountRows(ctx),
    ...rangeOfMotionRows(ctx),
    ...rangeChangeRows(ctx),
    ...powerRows(ctx),
    ...stabilityRows(ctx),
    ...heatRows(ctx),
    ...strengthRows(ctx, loads),
    budgetRow(ctx),
  ];

  return { rows, joints: loads, massG: ctx.all.grams, com: ctx.all.com, masses, stability: stabilityOf(ctx) };
}
