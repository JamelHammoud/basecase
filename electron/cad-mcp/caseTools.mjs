import { z } from 'zod';
import { bridge, fail, imageReply, text } from './shared.mjs';
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
      'console makes the Case an app the person runs: with one, the app opens the new Case running, laid out by it. ' +
      'Returns { ok, id, name, brief, seconds, objects, running? } or { ok: false, problem } saying what to change, e.g. the goals this robot can try or the console path it refused.',
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
      console: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'What the running Case shows and reads. input: 1–4 input source ids (keys, gamepad, phone; a source this version lacks is refused, so leave it out and say so). ' +
            'panels: [{ id, kind, title?, ... }] with kind camera (signal: camera.<name> or camera.*), value (signal), plot (signals, seconds), table (of: servos, joints or signals), button (action: try, end-try, drive, stop, start-over, reset), list (of: tries or failures), text (of: brief, or text), map (trail). ' +
            'Signals: joint.<id>.target/position/effort (joint.*.position in plots), robot.height/tilt/speed/travelled/x/z, probe.<name>, input.<source>.forward/left/turn/lift/grip, goal.passed/margin, time, and the Case’s own. ' +
            'signals (optional): [{ id, kind: timer (seconds), counter (when: { signal, above|below }), score (sum: [{ signal, times }]) }]. ' +
            'layout: { areas: [{ size: 200–720, panels: [ids] }, { canvas: true }, …] }, the canvas once, every panel placed once.',
        ),
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

export const runCase = {
  name: 'run_case',
  config: {
    title: 'Run a Case',
    description:
      'Runs a Case in this scene on the current design, over seeded randomized runs (friction, mass, servo strength and delay varied), the same runs as its Checks row; when nothing changed since that row ran it returns its result at once. ' +
      'Returns the pass count, the median margin (above 0 passes), the failed labels most runs share, the reason when the robot can’t enter the Case, and a filmstrip of the worst run (start, middle, end). ' +
      'Use it to check a design against the user’s Cases, and after each design change while making one pass.',
    inputSchema: {
      id: z.string().min(1).max(120).optional().describe('The Case’s id or name; the open Case when left out'),
      runs: z.number().int().min(1).max(100).optional().describe('How many seeded runs; 20 when left out'),
    },
  },
  handler: async (args) => {
    try {
      const res = await bridge('run_case', args, 300000);

      return res?.ok === false ? text(res) : imageReply(res, 'The Case ran.');
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
