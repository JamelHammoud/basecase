import { z } from 'zod';
import { formatRecipe, recipeIndex, searchRecipes } from './recipes/catalog.mjs';
import { vec3 } from './schemas.mjs';
import { bridge, fail, text } from './shared.mjs';

const PORTS_NOTE =
  'Recipe modules echo their interfaces as PORT lines (name, position, outward axis, kind, diameter). Place them with placed(pos, r, prefix) instead of translate/rotate so the ports land in your part frame.';

export const findRecipes = {
  name: 'find_recipes',
  config: {
    title: 'Find recipes',
    description:
      'Searches the library of proven, tested OpenSCAD modules (in robotics.scad, plus mechanisms.scad): seam shells with lip, reveal and insert screw towers; sculpted split shells; bosses, counterbores, ribs, vents, bed chamfers, flanges; STS3215 / STS3250 servo cradles and U-links; a battery bay with hatch; a Raspberry Pi 5 tray; gears, GT2 pulleys, four-bar linkages, snap pins and a print-in-place hinge. ' +
      'Returns each match with its use, parameters, ports and a snippet that compiles. Call it before modeling any of these, then adapt the snippet in model_part instead of writing the feature from scratch. An empty query lists every recipe.',
    inputSchema: {
      query: z.string().max(80).describe('2-5 words, e.g. "servo joint", "battery hatch", "shell seam", "gear"'),
      limit: z.number().int().min(1).max(6).optional(),
    },
  },
  handler: async ({ query = '', limit = 3 }) => {
    if (!query.trim()) return text(`Recipes:\n${recipeIndex()}\n\n${PORTS_NOTE}`);

    const found = searchRecipes(query, limit);

    if (!found.length) return text(`No recipe matches "${query}". Recipes:\n${recipeIndex()}`);

    return text([...found.map(formatRecipe), PORTS_NOTE].join('\n\n'));
  },
};

export const synthesizeLinkage = {
  name: 'synthesize_linkage',
  config: {
    title: 'Fit a four-bar to a path',
    description:
      'Fits crank-rocker four-bar linkages whose coupler point P passes through the given path points, in order. ' +
      'Returns up to 3, best first, each with its max and RMS path error in mm, minimum transmission angle, crank sweep, link lengths, coupler point and crank pivot. ' +
      'insert places that solution in the scene: four printed bars (the four_bar recipe) with an STS3215 driving the crank joint, its range the sweep that traces the path. ' +
      'Use it for a leg, finger or nodding head designed by the path its tip traces, instead of guessing four_bar lengths.',
    inputSchema: {
      points: z
        .array(z.array(z.number()).length(2))
        .min(5)
        .max(12)
        .describe('5-12 [x, y] points in mm in the linkage plane, in the order the tip passes them'),
      plane: z
        .enum(['XY', 'XZ', 'YZ'])
        .optional()
        .describe('the linkage plane in the CAD frame (Z up); default XY, the ground'),
      origin: vec3.optional().describe("CAD mm where the plane's (0, 0) sits; default [0, 0, 0]"),
      insert: z.number().int().min(1).max(3).optional().describe('insert solution 1-3 into the scene'),
    },
  },
  handler: async (args) => {
    try {
      return text((await bridge('synthesize_linkage', args))?.text || 'ok');
    } catch (err) {
      return fail(err);
    }
  },
};

export const makeActuator = {
  name: 'make_actuator',
  config: {
    title: 'Make an actuator',
    description:
      'Replaces a revolute joint’s servo with a generated printed cycloidal actuator around a catalog BLDC motor (the cycloidal_drive recipe), sized to the joint’s stance, hold and walking peak loads and to the bed. ' +
      'Places the motor, its driver and output encoder, bearings and screws as bought parts and six printed parts on the joint axis, rewires the joint, and its estimated torque, speed and reflected armature drive Servo torque, Peak torque and the MJCF. One undo removes it. ' +
      'Use it for a joint no catalog servo can drive; it says why when no actuator fits.',
    inputSchema: {
      joint: z.string().max(80).describe('the joint id, e.g. "l_knee"'),
    },
  },
  handler: async (args) => {
    try {
      return text((await bridge('make_actuator', args))?.text || 'ok');
    } catch (err) {
      return fail(err);
    }
  },
};
