import type { V3 } from '../utils/kinematics';
import {
  holdNear,
  marker,
  near,
  pointProblem,
  REACH,
  touchTarget,
  type BuilderRobot,
  type CaseGoal,
  type GoalPlan,
  type GoalValues,
} from './caseGoals';
import type { RobotSlot, SlotPose } from './schema';

export const LEAD_SLOT = 'a';
export const PARTNER_SLOT = 'b';

const HANDOFF_AT_S = 3;
const HOLD_SECONDS = 0.2;
const FACING_DEG = 180;

interface PartnerPlace {
  pose: SlotPose;
  anchor: V3;
}

function partnerPlace(robot: BuilderRobot, partner: BuilderRobot, at: V3): PartnerPlace {
  const lead = robot.facts.anchor;
  const own = partner.facts.anchor;
  const anchor: V3 = [2 * at[0] - lead[0], own[1], 2 * at[2] - lead[2]];
  const position: V3 = [anchor[0] + own[0] - partner.pivot[0], partner.pivot[1], anchor[2] + own[2] - partner.pivot[2]];

  return { pose: { position, yawDeg: FACING_DEG }, anchor };
}

const armSlot = (id: string, robot: BuilderRobot): RobotSlot => ({
  id,
  needs: ['arm'],
  minJoints: 2,
  binding: robot.facts.endEffector ? { endEffector: robot.facts.endEffector } : {},
  reachMm: robot.facts.reachMm,
  anchor: robot.facts.anchor,
});

function handoffPlan(robot: BuilderRobot, v: GoalValues): GoalPlan {
  const partner = robot.partner ?? robot;
  const at = touchTarget(robot, v);
  const { pose, anchor } = partnerPlace(robot, partner, at);
  const rest = (r: BuilderRobot) => r.facts.endEffector?.point ?? r.facts.anchor;
  const lead = armSlot(LEAD_SLOT, robot);

  return {
    brief: 'Touch the point with one arm, then the other.',
    slot: lead,
    slots: [lead, { ...armSlot(PARTNER_SLOT, partner), anchor, pose }],
    objects: [
      {
        ...marker('point', 'Point', at, [v.radiusMm * 2, v.radiusMm * 2, v.radiusMm * 2]),
        kind: 'sphere',
        opacity: 0.6,
      },
    ],
    probes: [
      { signal: LEAD_SLOT, from: { effector: LEAD_SLOT }, to: { object: 'point' } },
      { signal: PARTNER_SLOT, from: { effector: PARTNER_SLOT }, to: { object: 'point' } },
    ],
    success: {
      sequence: [
        holdNear(LEAD_SLOT, v.radiusMm, HOLD_SECONDS),
        {
          hold_for: {
            seconds: HOLD_SECONDS,
            within: 'whole',
            state: { all: [near(PARTNER_SLOT, v.radiusMm), { not: near(LEAD_SLOT, v.radiusMm) }] },
          },
        },
      ],
    },
    timeline: [
      { at: 0.2, slot: LEAD_SLOT, target: at },
      { at: HANDOFF_AT_S, slot: LEAD_SLOT, target: rest(robot) },
      { at: HANDOFF_AT_S, slot: PARTNER_SLOT, target: at },
    ],
    controls: REACH,
    route: { from: [at[0], 0, robot.pivot[2]], to: [at[0], 0, at[2]], halfWidth: v.radiusMm },
    target: { at, radius: v.radiusMm },
  };
}

export const handoffGoal: CaseGoal = {
  kind: 'handoff',
  name: 'Hand Off to a Spot',
  needs: ['arm'],
  pair: true,
  params: ['distanceMm', 'heightMm', 'radiusMm', 'seconds'],
  plan: handoffPlan,
  problem: (robot, v) => {
    const at = touchTarget(robot, v);
    const partner = robot.partner ?? robot;

    return (
      pointProblem(robot.facts, at, v) ??
      pointProblem({ anchor: partnerPlace(robot, partner, at).anchor, reachMm: partner.facts.reachMm }, at, v)
    );
  },
};
