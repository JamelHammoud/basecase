import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';
import { worldObject } from './worldTools.mjs';

const mm = (what) => z.number().finite().optional().describe(what);

const CONSOLE_HELP =
  'input: input source ids, first moving one drives: keys, gamepad, or one the person named (camera, phone, midi, leader-arm, voice, policy, script; refused while this version lacks it). ' +
  'signals (optional): the Case’s own numbers, { id, kind: timer, seconds? } counting a try’s seconds (down from seconds), { id, kind: counter, when: { signal, above | below } }, { id, kind: score, sum: [{ signal, times }] }. ' +
  'panels: { id, kind, title? } plus the kind’s settings: camera { signal: camera.<name> or camera.* (robot cameras), camera.operator (the person, needs the camera input) }, value { signal }, plot { signals, seconds? }, ' +
  'table { of: joints | servos | signals }, button { action: try | end-try | drive | stop | start-over | reset }, list { of: tries | failures }, text { of: brief } or { text }, map { trail? }. ' +
  'Signals: joint.<id or *>.target | position | effort, robot.height | tilt | speed | travelled | x | z, probe.<probe>, input.<source>.forward | left | turn | lift | grip, goal.passed | margin | failed, time, and declared signals. ' +
  'layout.areas: columns in order, exactly one { canvas: true }, the rest { size: 200–720 px, panels: [ids] }, every panel placed once.';

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
      'console makes the Case an app: how it drives and what it shows when it runs. With one, the app opens the new Case in Run Case for the user. ' +
      'Returns { ok, id, name, brief, seconds, objects, running } or { ok: false, problem } saying what to change, e.g. the goals this robot can try, or the console field it refused.',
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
        .object({
          input: z.array(z.string()).min(1).max(4),
          signals: z.array(z.record(z.string(), z.unknown())).max(32).optional(),
          panels: z.array(z.record(z.string(), z.unknown())).max(24),
          layout: z.object({ areas: z.array(z.record(z.string(), z.unknown())).min(1).max(6) }),
        })
        .optional()
        .describe(CONSOLE_HELP),
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
