import { listIds } from '../assembly/reportText';
import { COMPONENT_BY_ID } from '../data/components';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { measuredJoints } from '../reality/measuredJoints';
import { calibratable } from '../reality/servoPart';
import { jointServos } from '../sim/mjcfEffort';
import { isWheelJoint } from '../sim/morphology';
import { jointLabel } from './engineeringFormat';
import { plural } from '../../electron/plural.mjs';
import { isMovable } from './kinematics';
import { buildRig } from './kinematicsRig';
import type { CheckContext, CheckRow, FindingFix } from './engineeringTypes';

const NAMED = 3;

const labels = (joints: RobotJoint[]) => listIds(joints.map(jointLabel), NAMED);

const hasTorque = (ctx: CheckContext, j: RobotJoint) => jointServos(j, ctx.byPart).length > 0 || (j.effortNm ?? 0) > 0;

const isCatalogServo = (p: ScenePart | undefined): p is ScenePart =>
  !!p?.componentId && COMPONENT_BY_ID[p.componentId]?.group === 'Servos';

const servoParts = (ctx: CheckContext, j: RobotJoint) =>
  (j.actuators ?? []).map((id) => ctx.byPart.get(id)).filter(isCatalogServo);

function torqueEstimateRow(ctx: CheckContext, movable: RobotJoint[]): CheckRow {
  const estimated = movable.filter((j) => !hasTorque(ctx, j));

  if (!estimated.length) return { check: 'Torque estimates', status: 'pass', detail: '' };

  return {
    check: 'Torque estimates',
    status: 'warn',
    detail: `${plural(estimated.length, 'joint')} without a servo`,
    detailInItems: true,
    items: [{ text: `No servo on ${labels(estimated)}`, ids: estimated.flatMap((j) => j.child), status: 'warn' }],
  };
}

function calibrateFix(ctx: CheckContext, guessed: RobotJoint[]): FindingFix | undefined {
  const joints = guessed.filter((j) => calibratable(j, ctx.parts)).map((j) => j.id);

  return joints.length ? { kind: 'calibrate', joints } : undefined;
}

function servoModelRows(ctx: CheckContext, movable: RobotJoint[]): CheckRow[] {
  const driven = movable.filter((j) => j.type === 'revolute' && servoParts(ctx, j).length > 0);

  if (!driven.length) return [];

  const rig = buildRig(ctx.joints, ctx.parts);
  const modelled = driven.filter((j) => !isWheelJoint(j, ctx.byPart, rig));

  if (!modelled.length) return [];

  const measured = measuredJoints({ joints: modelled, parts: ctx.parts, calibrations: ctx.project.servoCalibrations });
  const guessed = modelled.filter((j) => !measured.has(j.id));

  if (!guessed.length) return [{ check: 'Servo models', status: 'pass', detail: '' }];

  const servos = guessed.flatMap((j) => servoParts(ctx, j));
  const names = listIds([...new Set(servos.map((p) => p.name))], NAMED);
  const fix = calibrateFix(ctx, guessed);

  return [
    {
      check: 'Servo models',
      status: 'warn',
      detail: `${plural(guessed.length, 'joint')} without a measured model`,
      detailInItems: true,
      items: [
        {
          text: `${names} on ${labels(guessed)}`,
          ids: servos.map((p) => p.id),
          status: 'warn',
          ...(fix ? { fix } : {}),
        },
      ],
    },
  ];
}

export function simModelRows(ctx: CheckContext): CheckRow[] {
  const movable = ctx.joints.filter(isMovable);

  if (!movable.length) return [];

  return [torqueEstimateRow(ctx, movable), ...servoModelRows(ctx, movable)];
}
