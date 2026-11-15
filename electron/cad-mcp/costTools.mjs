import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';
import { clipTexts } from './textLimits.mjs';

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

export const sizeArm = {
  name: 'size_arm',
  config: {
    title: 'Size an arm',
    description:
      'Sizes a servo arm from the points it must reach and the grams it carries, and places it: base yaw, shoulder, elbow and wrist pitch on STS3215-outline servos with the arm_template links. ' +
      'It finds the shortest link lengths and base riser on a 5 mm grid (links from 75 mm) where the tool flange reaches every target within 2 mm with every joint at least 10% inside its range, turns the base to face the targets, then picks the cheapest servo per joint that passes the hold check with the payload at the wrist, at the cheapest supply that passes. ' +
      'It writes the skeleton (as define_skeleton, replacing any), adds one servo per joint and the printed links (the web demo adds no links), and returns the lengths, servos, prices and reach. A target it cannot reach gives no arm and names that target. ' +
      'Call it first when a person says where an arm must reach and what it carries.',
    inputSchema: {
      targets: z
        .array(z.object({ name: z.string().optional(), at: XYZ.describe('mm, z up, front −Y') }))
        .min(1)
        .max(8),
      payload_g: z.number().min(0).max(5000).describe('Grams at the wrist: the gripper and what it holds'),
      base: XYZ.optional().describe('Where the base stands, mm; default the origin'),
    },
  },
  handler: async (args) => {
    try {
      const { parts: targets, notice } = clipTexts(args.targets.map((t, i) => ({ ...t, id: `target-${i + 1}` })));
      const res = await bridge('size_arm', { ...args, targets }, 120000);

      return text(`${res?.text || 'No arm.'}${notice}`);
    } catch (err) {
      return fail(err);
    }
  },
};
