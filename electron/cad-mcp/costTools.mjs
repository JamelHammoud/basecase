import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

export const sizeActuators = {
  name: 'size_actuators',
  config: {
    title: 'Size actuators',
    description:
      "Picks an actuator for every declared joint from this scene's own loads (the same model as verify_design's Servo torque: leg joints carry the whole robot on one leg at the gait's crouch; other joints hold their limb across its range). " +
      'It tries every servo bus (Feetech, Dynamixel, Hiwonder, CAN, RS-485) with every catalog battery, direct or through a regulator, and returns the cheapest set where every joint passes Stance and Heat with margin: per joint the cheapest actuator that passes, with its share of stall and of rated torque, and one tier up. ' +
      'Totals include the battery, regulators and bus adapter, and it re-runs the loads with the new actuator weights. Where nothing affordable passes, it says how much to shorten the leg segment or how much weight to remove instead. ' +
      'Call it after define_joints, before choosing servos for a legged robot or when the BOM is over budget. Prices are list prices; never quote one that is not here, in find_parts or in get_bom. ' +
      'Before any geometry it runs on the skeleton (define_skeleton with mass_g): loads from link lengths, actuator weights and the estimated mass. source picks one; by default the model once joints are declared, else the skeleton.',
    inputSchema: { source: z.enum(['scene', 'skeleton']).optional() },
  },
  handler: async ({ source }) => {
    try {
      const res = await bridge('size_actuators', source ? { source } : {}, 120000);

      return text(res?.text || 'No joints to size.');
    } catch (err) {
      return fail(err);
    }
  },
};

const XYZ = z.tuple([z.number(), z.number(), z.number()]);

export const sweepDesign = {
  name: 'sweep_design',
  config: {
    title: 'Sweep a design parameter',
    description:
      'Tries one design parameter at several values on copies of the scene in memory and returns a table of what changes against the scene as modeled. It never edits the scene: apply the winner yourself. ' +
      'Parameters: "servo" swaps the servos on `joints` for each catalog key in `servos` (e.g. "component:feetech-sts3215|c018"); "battery_offset" moves the battery by each [x, y, z] in `offsets_mm` (Z up, front −Y); "foot_scale" scales parts named Foot, Feet or Sole by each { length, width } in `feet` (1 = as modeled). ' +
      "Per value it re-runs verify_design's static Servo torque (worst joint, share of stall), the cheapest passing set from size_actuators, standing stability (how far it tips before falling) and a 4.5 s MuJoCo hold with shoves of 0.3 × body weight forward and sideways, servos limited to 0.7 × stall (stood or fell, and the worst leg joint's 99th-percentile torque over its stall). " +
      'Use it to choose between options with numbers instead of guessing; up to 6 values per call. Takes a few seconds per value.',
    inputSchema: {
      parameter: z.enum(['servo', 'battery_offset', 'foot_scale']),
      joints: z.array(z.string()).max(40).optional().describe('servo: the joints whose servos to swap'),
      servos: z.array(z.string()).max(6).optional().describe('servo: catalog keys to try'),
      offsets_mm: z.array(XYZ).max(6).optional().describe('battery_offset: moves to try, mm'),
      feet: z
        .array(
          z.object({ length: z.number().min(0.5).max(2).optional(), width: z.number().min(0.5).max(2).optional() }),
        )
        .max(6)
        .optional()
        .describe('foot_scale: scales to try'),
    },
  },
  handler: async (args) => {
    try {
      const res = await bridge('sweep_design', args, 300000);

      return text(res?.text || 'Nothing to sweep.');
    } catch (err) {
      return fail(err);
    }
  },
};
