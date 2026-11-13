import type { RobotJoint } from '../types/robotics';
import { jointServos } from '../sim/mjcfEffort';
import { isWheelJoint } from '../sim/morphology';
import { measuredServos } from '../sim/servoModel';
import { count, jointLabel } from './engineeringFormat';
import { isMovable } from './kinematics';
import { buildRig } from './kinematicsRig';
import type { CheckContext, CheckRow } from './engineeringTypes';

const labels = (joints: RobotJoint[]) => joints.map(jointLabel).join(', ');

const hasStall = (ctx: CheckContext, j: RobotJoint) => jointServos(j, ctx.byPart).some((s) => s.stallNm > 0);

const hasTorque = (ctx: CheckContext, j: RobotJoint) => hasStall(ctx, j) || (j.effortNm ?? 0) > 0;

function torqueEstimateRow(ctx: CheckContext, movable: RobotJoint[]): CheckRow {
  const estimated = movable.filter((j) => !hasTorque(ctx, j));

  if (!estimated.length)
    return { check: 'Torque estimates', status: 'pass', detail: 'Every joint has a servo or a published limit' };

  return {
    check: 'Torque estimates',
    status: 'warn',
    detail: `${count(estimated.length, 'joint')} without a servo`,
    items: [{ text: `No servo on ${labels(estimated)}`, ids: estimated.flatMap((j) => j.child), status: 'warn' }],
  };
}

function servoModelRows(ctx: CheckContext, movable: RobotJoint[]): CheckRow[] {
  const servoed = movable.filter((j) => jointServos(j, ctx.byPart).length > 0);

  if (!servoed.length) return [];

  const rig = buildRig(ctx.joints, ctx.parts);
  const measured = (j: RobotJoint) =>
    j.type === 'revolute' && !isWheelJoint(j, ctx.byPart, rig) && measuredServos(jointServos(j, ctx.byPart));
  const guessed = servoed.filter((j) => !measured(j));

  if (!guessed.length) return [{ check: 'Servo models', status: 'pass', detail: 'Every servo has a measured model' }];

  const servoIds = guessed.flatMap((j) => j.actuators ?? []);
  const names = [...new Set(servoIds.map((id) => ctx.byPart.get(id)?.name ?? id))].join(', ');

  return [
    {
      check: 'Servo models',
      status: 'warn',
      detail: `${count(guessed.length, 'joint')} without a measured model`,
      items: [{ text: `${names} on ${labels(guessed)}`, ids: servoIds, status: 'warn' }],
    },
  ];
}

export function simModelRows(ctx: CheckContext): CheckRow[] {
  const movable = ctx.joints.filter(isMovable);

  if (!movable.length) return [];

  return [torqueEstimateRow(ctx, movable), ...servoModelRows(ctx, movable)];
}
