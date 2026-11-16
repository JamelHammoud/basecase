import type { Formula, State } from '../skills/contract';
import type { BuilderRobot, CaseGoal, GoalPlan, GoalValues } from './caseGoals';
import { marker, near, GRIP } from './caseGoals';
import { handoffLayout, handoffProblem, type HandoffLayout } from './handoffLayout';
import { handoffReference } from './handoffReference';
import { FLOOR_PROBE_DEPTH_MM } from './probes';
import type { CaseProbe, RobotSlot, WorldObject } from './schema';

export const LEAD_SLOT = 'a';
export const PARTNER_SLOT = 'b';

const HOLD_S = 0.2;
const FINAL_HOLD_S = 0.3;
const FINAL_SLACK_MM = 4;
const BLOCK_DENSITY_G_PER_CM3 = 0.15;

const gripperSlot = (id: string, robot: BuilderRobot): RobotSlot => ({
  id,
  needs: ['arm', 'gripper'],
  minJoints: 2,
  binding: robot.facts.endEffector ? { endEffector: robot.facts.endEffector } : {},
  reachMm: robot.facts.reachMm,
  anchor: robot.facts.anchor,
});

const present = (signal: string): State => ({ atom: { expr: { signal }, cmp: '>', value: 0.5, scale: 1 } });
const absent = (signal: string): State => ({ atom: { expr: { signal }, cmp: '<', value: 0.5, scale: 1 } });
const hold = (state: State): Formula => ({ hold_for: { seconds: HOLD_S, within: 'whole', state } });

function transferContract(layout: HandoffLayout, radius: number): Formula {
  const { size } = layout;
  const raised: State = {
    atom: { expr: { delta: { signal: 'lift' } }, cmp: '>', value: size[1], scale: size[1] },
  };
  const placed: State = {
    all: [
      near('spot', radius),
      { atom: { expr: { delta: { signal: 'lift' } }, cmp: '<', value: FINAL_SLACK_MM, scale: size[1] } },
    ],
  };
  const separated: State = {
    atom: { expr: { signal: 'donorGap' }, cmp: '>', value: layout.gap, scale: layout.gap },
  };

  return {
    sequence: [
      hold({ all: [present('donorGrip'), absent('recipientContact'), raised] }),
      {
        all: [
          { always: { window: 'whole', state: { any: [present('donorGrip'), present('recipientGrip'), placed] } } },
          {
            sequence: [
              hold({ all: [present('donorGrip'), present('recipientGrip'), raised] }),
              hold({ all: [present('recipientGrip'), absent('donorContact'), raised, separated] }),
              {
                always: {
                  window: { last: FINAL_HOLD_S },
                  state: { all: [placed, absent('donorContact'), absent('recipientContact'), separated] },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function transferObjects(layout: HandoffLayout, radius: number): WorldObject[] {
  const { size, block, spot } = layout;

  return [
    {
      id: 'block',
      name: 'Block',
      kind: 'box',
      position: block,
      rotation: [0, 0, 0],
      size,
      color: '#c8a26a',
      behavior: 'dynamic',
      massG: Math.max(1, Math.round((size[0] * size[1] * size[2] * BLOCK_DENSITY_G_PER_CM3) / 1000)),
      points: { donor: [0, 0, -layout.gap / 2], recipient: [0, 0, layout.gap / 2] },
    },
    marker('spot', 'Spot', spot, [radius * 2, size[1], radius * 2]),
  ];
}

function transferProbes({ block }: HandoffLayout): CaseProbe[] {
  const pairs = [
    ['donor', LEAD_SLOT],
    ['recipient', PARTNER_SLOT],
  ];
  const evidence = pairs.flatMap(([role, slot]): CaseProbe[] => [
    { signal: `${role}Grip`, kind: 'grip', from: { effector: slot }, to: { object: 'block' } },
    { signal: `${role}Contact`, kind: 'contact', from: { effector: slot }, to: { object: 'block' } },
    { signal: `${role}Gap`, from: { effector: slot }, to: { object: 'block' } },
  ]);

  return [
    ...evidence,
    { signal: 'spot', from: { object: 'block' }, to: { object: 'spot' } },
    { signal: 'lift', from: { object: 'block' }, to: { point: [block[0], -FLOOR_PROBE_DEPTH_MM, block[2]] } },
  ];
}

function handoffPlan(robot: BuilderRobot, v: GoalValues): GoalPlan {
  const partner = robot.partner ?? robot;
  const layout = handoffLayout(robot, v);
  const lead = gripperSlot(LEAD_SLOT, robot);

  return {
    brief: 'Lift the block, pass it to the other gripper, and set it on the spot.',
    slot: lead,
    slots: [lead, { ...gripperSlot(PARTNER_SLOT, partner), anchor: layout.anchor, pose: layout.pose }],
    objects: transferObjects(layout, v.radiusMm),
    probes: transferProbes(layout),
    success: transferContract(layout, v.radiusMm),
    timeline: handoffReference(robot, layout),
    controls: GRIP,
    route: { from: layout.block, to: layout.spot, halfWidth: v.radiusMm },
  };
}

export function handoffDefaults(robot: BuilderRobot): Partial<GoalValues> {
  const reach = Math.min(robot.facts.reachMm, robot.partner?.facts.reachMm ?? robot.facts.reachMm);
  const values = { distanceMm: Math.round(reach * 0.45), heightMm: Math.round(reach * 0.3) };
  const layout = handoffLayout(robot, values);
  const last = handoffReference(robot, layout).at(-1)!;

  return { ...values, radiusMm: Math.max(12, Math.round(layout.size[0] / 2)), seconds: Math.ceil(last.at + 3) };
}

export const handoffGoal: CaseGoal = {
  kind: 'handoff',
  name: 'Hand Off to a Spot',
  needs: ['gripper'],
  pair: true,
  params: ['distanceMm', 'heightMm', 'radiusMm', 'seconds'],
  plan: handoffPlan,
  problem: handoffProblem,
};
