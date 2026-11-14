import { z } from 'zod';
import { bridge, fail, imageReply, text } from './shared.mjs';
import { worldObject } from './worldTools.mjs';

const mm = (what) => z.number().finite().optional().describe(what);

export const createCase = {
  name: 'create_case',
  config: {
    title: 'Make a Case',
    description:
      'Adds a Case to the scene and opens it in the Simulate tab: a world and a goal the robot tries in simulation, scored by the app (the user presses Try It and drives). ' +
      'Use it when the user describes something for the robot to try, or sends /case followed by a description. Pick the goal and world closest to their words and set the numbers from them; never change the design for a Case. ' +
      'Goals: reach (stop on a spot distance_mm ahead; wheels or legs), push (push a box_mm cube push_mm onto a spot; wheels or legs), path (pass `stops` spots spacing_mm apart, in order; wheels or legs), ' +
      'walk (walk distance_mm without falling; legs), touch (touch a point with the end effector, distance_mm ahead of the arm, height_mm above the floor, side_mm to its left; arms; with `dots` 2 or 3, touch that many dots the arm can reach, in order, instead). ' +
      'pick (pick up a block distance_mm ahead of the arm and set it on a spot spacing_mm farther out; arms with a gripper, open floor only). ' +
      'handoff (as touch, then a second arm from another open scene tab, facing the first, touches the same point while the first leaves it; needs an arm in another open tab). ' +
      'radius_mm is how close counts, seconds the time allowed; anything left out gets a default sized to the robot. ' +
      'Worlds: floor; corridor (a wall on each side) and block (a block in the way) for reach, push, path and walk; shelf (the point sits on a shelf) for touch. ' +
      'Terrain worlds for reach, path and walk, sized to the robot’s legs or wheels: rough (a grid of tiles up to rise_mm tall), steps (a platform rise_mm tall to cross) and slope (a ramp up and down at incline_deg); use them to test climbing, e.g. "make sure it can climb a step" is walk or reach over steps. ' +
      'objects adds world objects as in set_world (agent frame). A legged robot that falls fails any Case. ' +
      'logic is a Routine (as in make_routine) the Case runs; score counts dynamic objects in or out of a marker spot. ' +
      'console makes the Case an app the person runs: with one, the app opens the new Case running, laid out by it. ' +
      'gestures names the body movements the Case reacts to; reply.teach lists the ones the person teaches with Teach Gesture. ' +
      'Returns { ok, id, name, brief, seconds, objects, running?, teach? } or { ok: false, problem } saying what to change, e.g. the goals this robot can try or the console path it refused.',
    inputSchema: {
      goal: z.enum(['reach', 'push', 'path', 'walk', 'touch', 'pick', 'handoff']),
      world: z
        .enum(['floor', 'corridor', 'block', 'shelf', 'rough', 'steps', 'slope'])
        .optional()
        .describe('floor when left out'),
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
      rise_mm: mm('rough: the tallest tile; steps: the platform’s height'),
      incline_deg: z.number().finite().optional().describe('slope: the ramp’s incline in degrees'),
      objects: z.array(worldObject).max(32).optional(),
      logic: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Base do drive hands the robot to the Case’s drive; watchers with model case-fact read score, timer, elapsed, <spot>-count, <object>-over…; live-input reads named events like voice, and a live-input watcher with id gesture reads the gesture’s name (when: { fact: gesture, is: wave })',
        ),
      score: z
        .object({ spot: z.string(), counts: z.enum(['in', 'out']) })
        .optional()
        .describe('in: objects inside the spot; out: objects that started in it and left'),
      gestures: z
        .array(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/))
        .max(18)
        .optional()
        .describe(
          'Lowercase gesture names, with the camera input. Built in: wave, raise-hand, raise-both-hands, point-left, point-right, thumbs-up, open-palm, clap, nod, shake-head. Any other name, up to 8, waits for the person to teach it',
        ),
      console: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'What the running Case shows and reads. input: 1–4 input source ids (keys, gamepad, phone, camera, code; a source this version lacks is refused, so leave it out and say so). ' +
            'panels: [{ id, kind, title?, ... }] with kind camera (signal: camera.<name> or camera.*), value (signal), plot (signals, seconds), table (of: servos, joints or signals), button (action: try, end-try, drive, stop, start-over, reset; gesture: a gesture name that presses it), list (of: tries or failures), text (of: brief, or text), map (trail), ' +
            'code (source: one HTML document with its script and style inline, at most 256 KB; height 80–900; at most 4 per console) for a control or readout no other kind draws, such as a joystick, a piano, a HUD or picture buttons. ' +
            'A code panel runs sandboxed with no network, storage or parent access, and its script uses window.basecase: signals(names, (values, time) => …) gets those signals at most 20 times a second; ' +
            'drive({ v: [forward, left, turn] each −1 to 1, aux?, target? }) drives the robot, drive(null) lets go, and needs code in input; event(name, value?) sends a named event to logic; action(name) runs a button action and resolves { ok, problem? }; ' +
            'CSS variables --bc-bg, --bc-panel, --bc-surface, --bc-accent, --bc-red, --bc-ink, --bc-ink-2, --bc-ink-3, --bc-font, --bc-text, --bc-radius and --bc-control match the studio. ' +
            'Signals: joint.<id>.target/position/effort (joint.*.position in plots), robot.height/tilt/speed/travelled/x/z, probe.<name>, input.<source>.forward/left/turn/lift/grip, gesture.<name> (1 for half a second after it, with the camera input), goal.passed/margin, time, and the Case’s own. ' +
            'signals (optional): [{ id, kind: timer (seconds), counter (when: { signal, above|below }), score (sum: [{ signal, times }]) }]. ' +
            'layout: { areas: [{ size: 200–720, panels: [ids] }, { canvas: true, overlays? }, …] }, the canvas once, every panel placed once. ' +
            'overlays draw code panels over the canvas: [{ panel, anchor, width?, height?, pointer? }], anchor top-left, top-right, bottom-left or bottom-right (width and height), top or bottom (height), left or right (width), or fill; sizes 40–1600; clicks pass through to the canvas unless pointer is true.',
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

export const exploreCase = {
  name: 'explore_case',
  config: {
    title: 'Explore servo versions on a Case',
    description:
      'Runs a Case on versions of this robot’s own design: every catalog version of each joint’s servo (for example Feetech STS3215 C001, C018, C044, C046), alone and together, times the supply voltages they’re rated at, up to 64 designs, each over 8 seeded randomized runs. ' +
      'The current design is the first. A robot powered by a battery keeps the battery’s voltage. Nothing in the scene changes; the rows also show in Results when the Case is open, where the user can apply one. ' +
      'Use it to answer which servo to buy, or whether a cheaper or stronger version still passes, with numbers. Only Cases with one robot slot. ' +
      'Returns { ok, case, runs, designs: [{ servos, volts, passes, worst_margin, cost_usd, mass_g, changes: [{ joints, mpn }], current?, refusal? }] } sorted by passes, then cost, or { ok: false, problem }.',
    inputSchema: {
      case: z.string().min(1).max(120).optional().describe('The Case’s id or name; the open Case when left out'),
    },
  },
  handler: async (args) => {
    try {
      return text(await bridge('explore_case', args, 600000));
    } catch (err) {
      return fail(err);
    }
  },
};
