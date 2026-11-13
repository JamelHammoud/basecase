import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';
import { worldObject } from './worldTools.mjs';

const mm = (what) => z.number().finite().optional().describe(what);

export const createCase = {
  name: 'create_case',
  config: {
    title: 'Create a Case',
    description:
      'Adds a Case to the scene and opens it in the Simulate tab: a world and a goal the robot tries in simulation, scored by the app (the user presses Try It and drives). ' +
      'Use it when the user describes something for the robot to try, or sends /case followed by a description. Pick the goal and world closest to their words and set the numbers from them; never change the design for a Case. ' +
      'Goals: reach (stop on a spot distance_mm ahead; wheels or legs), push (push a box_mm cube push_mm onto a spot; wheels or legs), path (pass `stops` spots spacing_mm apart, in order; wheels or legs), ' +
      'walk (walk distance_mm without falling; legs), touch (touch a point with the end effector, distance_mm ahead of the arm, height_mm above the floor, side_mm to its left; arms; with `dots` 2 or 3, touch that many dots the arm can reach, in order, instead). ' +
      'pick (pick up a block distance_mm ahead of the arm and set it on a spot spacing_mm farther out; arms with a gripper, open floor only). ' +
      'handoff (as touch, then a second arm from another open scene tab, facing the first, touches the same point while the first leaves it; needs an arm in another open tab). ' +
      'radius_mm is how close counts, seconds the time allowed; anything left out gets a default sized to the robot. ' +
      'Worlds: floor; corridor (a wall on each side) and block (a block in the way) for reach, push, path and walk; shelf (the point sits on a shelf) for touch. ' +
      'objects adds world objects as in set_world (agent frame). A legged robot that falls fails any Case. ' +
      'logic is a Routine (as in make_routine) the Case runs; score counts dynamic objects in or out of a marker spot. ' +
      'Returns { ok, id, name, brief, seconds, objects } or { ok: false, problem } saying what to change, e.g. the goals this robot can try.',
    inputSchema: {
      goal: z.enum(['reach', 'push', 'path', 'walk', 'touch', 'pick', 'handoff']),
      world: z.enum(['floor', 'corridor', 'block', 'shelf']).optional().describe('floor when left out'),
      name: z
        .string()
        .min(1)
        .max(80)
        .optional()
        .describe('Title Case, e.g. "Push the Crate"; made from the goal and world when left out'),
      brief: z
        .string()
        .min(1)
        .max(300)
        .optional()
        .describe('One sentence saying what to do; made from the goal when left out'),
      distance_mm: mm('reach, walk, touch and pick: how far ahead'),
      height_mm: mm('touch: height of the point above the floor'),
      side_mm: mm('touch: offset of the point to the arm’s left (+X)'),
      radius_mm: mm('How close counts as there'),
      push_mm: mm('push: how far the box must go'),
      box_mm: mm('push: the box’s side'),
      dots: z.number().int().min(1).max(3).optional().describe('touch: how many dots, in order'),
      stops: z.number().int().min(2).max(8).optional().describe('path: how many spots'),
      spacing_mm: mm('path: distance between spots; pick: from the block to the spot'),
      seconds: z.number().min(2).max(120).optional(),
      objects: z.array(worldObject).max(32).optional(),
      logic: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Base do drive hands the robot to the Case’s drive; watchers with model case-fact read score, timer, elapsed, <spot>-count, <object>-over…; live-input reads named events like voice',
        ),
      score: z
        .object({ spot: z.string(), counts: z.enum(['in', 'out']) })
        .optional()
        .describe('in: objects inside the spot; out: objects that started in it and left'),
    },
  },
  handler: async (args) => {
    try {
      return text(await bridge('create_case', args, 60000));
    } catch (err) {
      return fail(err);
    }
  },
};

export const compareCase = {
  name: 'compare_case',
  config: {
    title: 'Compare robots on a Case',
    description:
      'Runs a Case 20 times with randomized friction, mass, servo strength and delay, on this scene’s robot and on the robot in another open scene tab, with the same seeds, and returns both side by side. ' +
      'Use it to answer which design is better: the user duplicates the scene, swaps a gripper, servo or camera mount, and asks which passes more often. ' +
      'The Case is scaled to each robot’s reach. Only robots that fit the Case are compared, and only Cases with one robot slot. ' +
      'Returns { ok, case, robots: [{ scene, passes, runs, median_margin, cost_usd, mass_g, refusal? }], better } where better names the scene with the higher pass rate (null on a tie), or { ok: false, problem, scenes? } listing the scenes that fit.',
    inputSchema: {
      case: z.string().min(1).max(120).optional().describe('The Case’s id or name; the open Case when left out'),
      scene: z
        .string()
        .min(1)
        .max(120)
        .optional()
        .describe('The other open scene tab’s name; the first whose robot fits when left out'),
    },
  },
  handler: async (args) => {
    try {
      return text(await bridge('compare_case', args, 300000));
    } catch (err) {
      return fail(err);
    }
  },
};
