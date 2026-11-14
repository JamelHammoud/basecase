import { z } from 'zod';
import { settledWrites } from './pendingWrites.mjs';
import { vec3 } from './schemas.mjs';
import { readEvidenceText } from './robotTools.mjs';
import { bridge, fail, text } from './shared.mjs';

const jointId = z.string().regex(/^[a-z0-9_-]+$/);
const box = z.object({ min: vec3, max: vec3 });

const skeletonJoint = z.object({
  id: jointId,
  name: z.string().max(60).optional().describe('e.g. "Left Knee Pitch"'),
  parent: jointId.optional().describe('The joint toward the torso; omit for joints on the base'),
  origin: vec3.describe('A point on the axis, mm, z up'),
  axis: vec3.describe('Axis direction, e.g. [1, 0, 0] for pitch'),
  type: z.enum(['revolute', 'prismatic']).optional(),
  range: z
    .tuple([z.number().min(-2000).max(0), z.number().min(0).max(2000)])
    .optional()
    .describe('Degrees (mm for prismatic) from this pose'),
  limb: z.enum(['leg', 'arm', 'neck', 'torso', 'other']).optional(),
  actuator: z
    .string()
    .regex(/^component:[a-z0-9-]+(\|[a-z0-9]+)?$/)
    .optional()
    .describe('Catalog key of the planned actuator, e.g. "component:feetech-sts3215|c018"'),
  tip: vec3.optional().describe('End of the link for joints with no joint further out: the sole, a fingertip'),
  link_mass_g: z.number().positive().optional().describe('Mass of the link this joint turns, when you know it'),
  payload_g: z.number().positive().optional().describe('Mass carried at the tip: a gripper and what it holds, g'),
});

export const defineSkeleton = {
  name: 'define_skeleton',
  config: {
    title: 'Define skeleton',
    description:
      'Lays out the robot before any geometry: each joint’s frame (a point on its axis and the axis), its parent joint, range, limb and planned actuator, and where leaf links end (tip). Returns link lengths and symmetric pairs (left/right and front/rear ids are paired on their own; pairs adds others) and flags pairs that are not mirror images. ' +
      'Then: place parts in a joint’s frame with frame: "<joint id>" on add_parts, update_parts or mate (position becomes an offset from the joint, axes stay the world’s); mirror_parts puts a framed part’s copy on the paired joint; size_actuators runs on the skeleton and mass_g before any part exists; define_joints takes origin, axis, range and limb from the skeleton joint with the same id. ' +
      'Merged by joint id unless replace is true. Moving a joint moves every part placed in its frame.',
    inputSchema: {
      joints: z.array(skeletonJoint).min(1).max(60),
      pairs: z
        .array(z.tuple([jointId, jointId]))
        .max(30)
        .optional(),
      mass_g: z.number().positive().optional().describe('Estimated mass of the whole robot, g'),
      replace: z.boolean().optional(),
    },
  },
  handler: async (args) => {
    try {
      return text((await bridge('define_skeleton', args))?.text ?? '');
    } catch (err) {
      return fail(err);
    }
  },
};

export const skeletonFromMotion = {
  name: 'skeleton_from_motion',
  config: {
    title: 'Skeleton from motion',
    description:
      'Fits a robot skeleton to a BVH motion clip (an attached evidence file, or a URL): per limb, the fewest revolute joints that keep every point of the limb within tolerance_mm of the clip over the whole clip. ' +
      'A bone that barely turns merges into its neighbour, a ball joint becomes the revolute axes that actually move, and a limb that holds still gets no joints. Limbs are measured against the body they hang from, so the body itself gets no joints. ' +
      'Link lengths scale to height_mm, the skeleton is posed as the clip’s first frame, and each range is the clip’s span plus 10%. It then picks the cheapest catalog servo per joint that holds the load and turns faster than the joint’s peak speed, at the cheapest supply that passes. ' +
      'It writes the skeleton (as define_skeleton, replacing any), places one servo per joint at its joint, and returns the joints, ranges, peak speeds, servos and prices. A tolerance no joints meet gives no skeleton and names the limb. ' +
      'Call it first when a person shows or names a motion the robot must perform, then design the body on the skeleton.',
    inputSchema: {
      file: z.string().optional().describe('Evidence path of a .bvh file'),
      url: z.string().url().optional().describe('Or an https link to one'),
      name: z.string().max(40).optional(),
      height_mm: z.number().min(50).max(3000).describe('Robot height standing, mm, matched to the performer’s'),
      tolerance_mm: z.number().positive().max(100).optional().describe('Default 1% of the height'),
      limbs: z
        .array(z.string().max(40))
        .max(12)
        .optional()
        .describe('Only these limbs, e.g. ["right_arm"]; a wrong name lists the clip’s limbs'),
    },
  },
  handler: async ({ file, ...rest }) => {
    try {
      const evidence = readEvidenceText(file);

      if (!evidence.found) return text(`${file}: not found. Call list_evidence for the exact paths.`);

      return text((await bridge('skeleton_from_motion', { ...rest, file, text: evidence.body }, 120000))?.text ?? '');
    } catch (err) {
      return fail(err);
    }
  },
};

const contract = z.object({
  owner: z.string().min(1).max(60).describe('The part designer or subassembly, as named in its Agent description'),
  ids: z.array(z.string()).min(1).max(120).describe('Part ids it owns, modeled or planned'),
  envelopes: z.array(box).max(8).optional().describe('Boxes its parts must stay inside, mm, z up'),
  datums: z
    .array(
      z.object({
        name: z.string().max(40),
        kind: z.enum(['axis', 'face']).optional().describe('axis: a port anywhere on the line; face: at the point'),
        at: vec3.optional(),
        axis: vec3.optional(),
        joint: jointId.optional().describe('A skeleton or declared joint: its axis is the datum'),
      }),
    )
    .max(20)
    .optional()
    .describe('Joint axes and mount faces its parts must carry a port on, within 0.2 mm'),
  bolt_patterns: z
    .array(
      z.object({
        name: z.string().max(40),
        size: z.enum(['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6']),
        axis: vec3,
        points: z.array(vec3).min(1).max(24),
      }),
    )
    .max(12)
    .optional()
    .describe('Hole positions its parts must have a hole or a fastened screw on'),
  seams: z
    .array(
      z.object({
        with: z.string(),
        size: z.enum(['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6']),
        count: z.number().int().min(1),
      }),
    )
    .max(12)
    .optional()
    .describe('Screws that must cross to another owner’s parts'),
  style: z.string().max(200).optional().describe('Shared look: fillet radius, wall, seam style'),
});

export const setInterfaces = {
  name: 'set_interfaces',
  config: {
    title: 'Set interfaces',
    description:
      'The lead writes one contract per part designer after the block-out, before launching them: the part ids it owns, envelope boxes, datums (joint axes and mount faces), bolt patterns, and the screws that cross each seam to another owner. ' +
      'Stored with the scene; merged by owner unless replace is true. Brief each designer with its owner name, and tell it to run check_interfaces before it hands back.',
    inputSchema: { contracts: z.array(contract).min(1).max(12), replace: z.boolean().optional() },
  },
  handler: async (args) => {
    try {
      return text((await bridge('set_interfaces', args))?.text ?? '');
    } catch (err) {
      return fail(err);
    }
  },
};

export const checkInterfaces = {
  name: 'check_interfaces',
  config: {
    title: 'Check interfaces',
    description:
      'Measures a subassembly against its contract: every part inside its envelope, every datum matched by a real port within 0.2 mm, every bolt-pattern hole matched by a hole port or a fastened screw, the seam screws present, and no part edited outside the owner’s ids (holes cut across a seam are allowed). ' +
      'The first line says pass, or how many problems to fix. A part designer runs it before handing back and fixes every problem first; the lead can run it for any owner.',
    inputSchema: { owner: z.string().min(1).max(60) },
  },
  handler: async ({ owner }) => {
    try {
      await settledWrites();

      return text((await bridge('check_interfaces', { owner }, 120000))?.text ?? '');
    } catch (err) {
      return fail(err);
    }
  },
};
