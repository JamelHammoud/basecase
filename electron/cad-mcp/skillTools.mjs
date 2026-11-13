import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

const V3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

const goal = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('reach'),
    part: z.string().min(1).max(128).describe('The part id that must reach, e.g. the gripper'),
    waypoints: z
      .array(z.object({ point_mm: V3.describe('Agent frame, mm'), hold_s: z.number().min(0).max(30).optional() }))
      .min(1)
      .max(8),
  }),
  z.object({
    kind: z.literal('velocity'),
    forward_mps: z.number().min(-2).max(2),
    left_mps: z.number().min(-2).max(2).optional(),
    turn_radps: z.number().min(-3).max(3).optional(),
  }),
  z.object({ kind: z.literal('open') }),
]);

const signal = z.object({
  kind: z.enum([
    'time',
    'joint-position',
    'joint-velocity',
    'joint-effort',
    'part-position',
    'base-height',
    'base-tilt',
    'base-forward',
    'contact',
  ]),
  joint: z.string().max(128).optional(),
  part: z.string().max(128).optional(),
  axis: z.enum(['x', 'y', 'z']).optional(),
  with: z.string().max(128).optional(),
});

const CONTRACT =
  'The contract is the judge: { success: Formula, failures: [{ label, formula }] } over named signals, in SI units (m, rad, s, meters in the MuJoCo world frame, which is the agent frame / 1000). ' +
  'Formula: { all: [..] }, { any: [..] }, { always: { window, state } }, { eventually: { window, state } }, { hold_for: { seconds, state, within: window } }, { sequence: [..] }. ' +
  'State: { all }, { any }, { not }, { atom: { expr, cmp: "<"|"<="|">"|">=", value, scale } } (scale: how much counts as a clear margin). ' +
  'Expr: { signal: name }, { abs: expr }, { delta: expr } (change since the start), { dist: [[x,y,z],[x,y,z]] }, { angle: [[..],[..]] } with each name a signal. ' +
  'Window: "whole", { from, to } or { last } in seconds. A success that looks only at the final instant is refused. ' +
  'Signals given for free: time; q_<joint id> for each joint (rad or m); for robots that move around, height (base, m), tilt (rad) and forward (m along the robot’s front). Add more in signals, e.g. { tip_z: { kind: "part-position", part: "gripper", axis: "z" } }.';

const ask = async (kind, args, timeoutMs) => {
  try {
    const res = await bridge(kind, args, timeoutMs);

    return text(res?.text ?? res);
  } catch (err) {
    return fail(err);
  }
};

export const draftSkill = {
  name: 'draft_skill',
  config: {
    title: 'Draft a skill',
    description:
      'First step of teaching the robot anything (a message starting with /train asks for this). Writes a task contract for the request and checks it on the robot in the scene, without training. ' +
      'Returns the draft id, the contract in plain words, which solver the router picks and why, one nominal rollout while holding still (it must fail, or the contract can’t tell the skill from doing nothing) and, for reach goals, one of the planned pose sequence, plus any design limit and the change that would lift it. ' +
      'Show the user the contract in words and the rollouts, and ask before train_skill: a race can take most of an hour. ' +
      'goal: reach (a part to points, solved by planning poses), velocity (moving around at a speed, solved by reward search in Forge) or open (anything else; the race tries the rest and says what it tried). ' +
      'rewards: optional RewardLang programs for reward search (`def reward(state):` returning a sum of term("name", value); state has gravity, z, z0, linvel, angvel, joint_pos, joint_vel, action, last_action, command, control_dt; exp, sum, abs, max). The contract judges, a reward only teaches. ' +
      CONTRACT,
    inputSchema: {
      name: z.string().min(1).max(60).describe('Short name, e.g. "Wave"'),
      request: z.string().min(1).max(400).describe('What the user asked for, in their words'),
      goal,
      seconds: z.number().min(0.5).max(60).describe('Length of one try'),
      contract: z.object({
        success: z.record(z.string(), z.unknown()),
        failures: z
          .array(z.object({ label: z.string().min(1).max(40), formula: z.record(z.string(), z.unknown()) }))
          .max(16)
          .optional(),
      }),
      signals: z.record(z.string().regex(/^\w{1,40}$/), signal).optional(),
      rewards: z.array(z.string().max(8000)).max(6).optional(),
      quasi_static: z.boolean().optional().describe('Slow enough to plan pose by pose'),
      motion_shape_matters: z
        .boolean()
        .optional()
        .describe('The shape of the motion is the point, not only the result'),
      contact_rich: z.boolean().optional(),
      eye: z
        .object({
          part: z.string().min(1).max(80).describe('The camera part, by name or id, on the robot'),
          cols: z.number().int().min(2).max(32).optional().describe('Default 16'),
          rows: z.number().int().min(2).max(24).optional().describe('Default 12'),
          range_m: z.number().min(0.2).max(10).optional().describe('How far it sees, default 3 m'),
        })
        .optional()
        .describe(
          'Give the policy a depth eye: a grid of distances seen through this camera, for skills that depend on what is around the robot (walls, edges, obstacles, something to find)',
        ),
      start_area: z
        .object({
          forward_m: z.array(z.number().min(-5).max(5)).length(2),
          side_m: z.array(z.number().min(-5).max(5)).length(2),
        })
        .optional()
        .describe(
          'Start each try somewhere in this area (m from the start pose, low to high), so a skill that sees learns from different distances',
        ),
    },
  },
  handler: (args) => ask('skill_draft', args, 180000),
};

export const trainSkill = {
  name: 'train_skill',
  config: {
    title: 'Train a skill',
    description:
      'Trains a skill in the background and returns at once. Pass draft (an id from draft_skill the user approved) to run the solver race on it: the router’s method first, then each later one, every result judged by Arena (96 randomized tries, 29 of 32 to pass) and saved as a skill card only if it passes. ' +
      'Or pass kit to train one of the Motor Kit entries a legged robot gets: stand, walk (velocity tracking, which Drive steers), get-up or settle. ' +
      'Or pass move, the name of one of the robot’s Pose-tab animations, to train it as a move the legged robot performs under physics (Forge tracks the animation, Arena judges it). ' +
      'Follow it with list_skills. When the race comes back not found, tell the user what was tried and offer the design change it reports. Only train when the user asks: it takes the CPU for minutes to an hour.',
    inputSchema: {
      draft: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .optional(),
      kit: z.enum(['stand', 'walk', 'get-up', 'settle']).optional(),
      move: z.string().min(1).max(80).optional().describe('The name of a Pose-tab animation'),
      budget_minutes: z.number().min(1).max(120).optional().describe('Race only: a cap on training time'),
    },
  },
  handler: (args) => ask('skill_train', args, 60000),
};

export const listSkills = {
  name: 'list_skills',
  config: {
    title: 'List skills',
    description:
      'The robot’s skills: its Motor Kit entries, its moves (one per Pose-tab animation of a legged robot) and the skills the user taught, each ready (with its Arena result), training (with progress) or needing training; then the last race’s outcome: the method that won, or what was tried and why each failed.',
    inputSchema: {},
  },
  handler: () => ask('skill_list', {}, 30000),
};
