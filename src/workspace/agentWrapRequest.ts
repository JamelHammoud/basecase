import type { PoseReply } from '../agent/agentPose';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { agentWrapTarget } from '../wrap/wrapPlan';
import type { WrapRobot } from './useWrapRobot';
import { plural } from '../../electron/plural.mjs';

export interface WrapRequestContext {
  parts: ScenePart[];
  joints: RobotJoint[];
  selectedIds: string[];
  setAction: (action: string) => void;
  wrap: WrapRobot['wrap'];
}

export async function wrapRobotRequest(
  payload: { mesh?: string; robot?: string },
  ctx: WrapRequestContext,
): Promise<PoseReply> {
  const target = agentWrapTarget(ctx.parts, ctx.joints, { ...payload, selectedIds: ctx.selectedIds });

  if (typeof target === 'string') return { text: target };

  ctx.setAction(`Wrapping ${target.robot.name}`);

  const made = await ctx.wrap(target);

  if (typeof made === 'string') return { text: made };

  const shells = made.shells.map((s) => `${s.id} "${s.name}"`).join(', ');

  return {
    text:
      `Wrapped ${target.robot.name} in ${plural(made.shells.length, 'shell')}, one per link: ${shells}. ` +
      `${target.mesh.id} is hidden. Each shell is a printed part that moves with its link.`,
  };
}
