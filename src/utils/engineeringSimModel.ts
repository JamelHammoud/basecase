import { jointModel } from '../sim/jointModel';
import type { RobotJoint } from '../types/robotics';
import { count } from './engineeringFormat';
import type { CheckContext, CheckRow } from './engineeringTypes';
import { buildRig, isMovable } from './kinematicsRig';

export const SIM_MODEL_CHECK = 'Simulation model';

const are = (n: number) => `${n} ${n === 1 ? 'joint is' : 'joints is'}`;

const jointIds = (joints: RobotJoint[]) => joints.flatMap((j) => (j.actuators?.length ? j.actuators : j.child));

export function simModelRows(ctx: CheckContext): CheckRow[] {
  const movable = ctx.joints.filter(isMovable);

  if (!movable.length) return [];

  const rig = buildRig(ctx.joints, ctx.parts);
  const models = movable.map((j) => ({ j, ...jointModel(j, ctx.byPart, rig) }));
  const torque = models.filter((m) => m.effortSource === 'estimate').map((m) => m.j);
  const response = models.filter((m) => m.dynamics === 'estimated' && m.effortSource !== 'estimate').map((m) => m.j);
  const items = [
    ...(torque.length
      ? [
          {
            text: `Torque for ${are(torque.length)} estimated from weight. Assign servos for exact limits.`,
            ids: jointIds(torque),
          },
        ]
      : []),
    ...(response.length
      ? [{ text: `Servo response for ${are(response.length)} estimated.`, ids: jointIds(response) }]
      : []),
  ];
  const estimated = torque.length + response.length;

  return [
    {
      check: SIM_MODEL_CHECK,
      status: items.length ? 'warn' : 'pass',
      detail: estimated
        ? `${estimated} of ${count(movable.length, 'joint')} estimated`
        : 'Every joint runs on a measured servo model',
      items,
    },
  ];
}
