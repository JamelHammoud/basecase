import { z } from 'zod';
import { VIEW } from './shared.mjs';
import { TEXT_LIMITS } from './textLimits.mjs';

const SHAPES = [
  'box',
  'cube',
  'cylinder',
  'tube',
  'sphere',
  'dome',
  'capsule',
  'cone',
  'pyramid',
  'hex_prism',
  'wedge',
  'torus',
  'servo',
  'stepper_motor',
  'l_bracket',
  'u_bracket',
  'standoff',
  'wheel',
  'bearing_block',
  'pcb_board',
  'hole_cylinder',
  'hole_box',
  'pivot_axis',
];

export const vec3 = z.array(z.number()).length(3);
export const idSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
  .describe('Stable kebab-case id, unique in the scene, e.g. "left-front-coxa"');

export const common = {
  name: z
    .string()
    .min(1)
    .describe(`Title Case name, at most ${TEXT_LIMITS.name} characters, e.g. "Left Front Coxa Bracket"`),
  rotation: vec3
    .optional()
    .describe('Euler degrees [rx, ry, rz], XYZ order, about the placement point. Default [0,0,0].'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe('Hex color sampled from the reference'),
  role: z
    .enum(['solid', 'cutout', 'reference'])
    .optional()
    .describe('solid (default), cutout, or reference (guide, not printed)'),
  group: z
    .string()
    .optional()
    .describe(
      `Subassembly, at most ${TEXT_LIMITS.group} characters, e.g. "Left Front Leg". Parts sharing it are grouped.`,
    ),
  material: z
    .enum(['printed', 'pla', 'petg', 'asa', 'tpu', 'cots'])
    .optional()
    .describe(
      'printed (the project filament, default), pla, petg or asa (a specific filament: parts that hold or touch a servo need petg or asa, since servos run at 60–70 °C and PLA softens at 54 °C), tpu (soles, bumpers), cots (bought part). For metal or plate parts use sheet.',
    ),
  sheet: z
    .enum(['aluminum', 'carbon', 'acrylic'])
    .nullable()
    .optional()
    .describe(
      'Cut this flat part from sheet instead of printing it: aluminum (6061), carbon (carbon fiber plate) or acrylic. The part needs two parallel faces with only through holes between them; its thickness snaps to the nearest stock size, its mass uses the sheet’s density, it leaves the print plates and gets a DXF in Cut Files. A part that isn’t flat gets no DXF, shows as sheet=<material>:not-flat in get_scene and blocks Checks until you flatten it or print it. null prints it again.',
    ),
  supply: z
    .string()
    .regex(/^supply:[a-z0-9-]+$/)
    .optional()
    .describe(
      'This part is the envelope of a bought supply from find_parts, e.g. "supply:lipo-3s-2200" for the battery: counted in the BOM, not printed',
    ),
  note: z
    .string()
    .optional()
    .describe(
      `Design intent: fasteners, clearances, print orientation, function. At most ${TEXT_LIMITS.note} characters (it shows in every get_scene line); longer notes are cut.`,
    ),
  frame: z
    .string()
    .regex(/^[a-z0-9_-]*$/)
    .optional()
    .describe(
      'A skeleton or declared joint id: position is then an offset from that joint, and the part moves when the joint does ("" detaches it)',
    ),
};

export const edgesSchema = z
  .object({ kind: z.enum(['fillet', 'chamfer']), mm: z.number().min(0).max(500) })
  .nullable()
  .optional()
  .describe(
    'Round (fillet) or bevel (chamfer) every edge of a box, cube, cylinder, tube, hex_prism or wedge by mm, kept inside its size and clamped to just under its limit (half the smallest side, half a tube’s wall, a hex_prism’s or wedge’s inradius); get_scene reports the result. mm 0 or null makes the edges sharp again.',
  );

export const primitiveSchema = z.object({
  id: idSchema,
  shape: z.enum(SHAPES),
  size: vec3.describe('[x, y, z] extents in mm before rotation (z is height)'),
  position: vec3.describe('Center [x, y, z] in mm; z up, floor z = 0'),
  thickness: z.number().positive().max(50).optional(),
  edges: edgesSchema,
  ...common,
});

export const catalogSchema = z.object({
  id: idSchema,
  catalog: z
    .string()
    .regex(/^(component:[a-z0-9-]+(\|[a-z0-9]+)?|hardware:[a-z_]+(\|[^|]*){0,4})$/)
    .describe(
      'Catalog key from find_parts, e.g. "component:feetech-sts3215|c018" (parts sold in versions need one) or "hardware:socket_head|M3|10"',
    ),
  position: vec3.describe('Center [x, y, z] in mm of the part as placed'),
  ...common,
  name: common.name.optional(),
});

export const ROOT = z
  .object({
    position: vec3
      .optional()
      .describe('Whole-robot offset from the modeled pose, mm (e.g. [0, 0, -40] crouches the body 40 mm)'),
    rotation: vec3.optional().describe('Whole-robot turn, XYZ degrees about the hips'),
  })
  .optional();
export const IK_GOAL = z.object({
  part: z
    .string()
    .describe('Part id, or a joint id (its link): e.g. the ankle joint for a foot, the wrist joint for a hand'),
  target: vec3.optional().describe('Where that point goes, mm (agent frame)'),
  move: vec3.optional().describe('Or how far to move it from where it is now, mm'),
  where: z
    .enum(['bottom', 'center'])
    .optional()
    .describe('The point on the part: bottom = the sole of a foot; center (default) for hands and heads'),
  keep_orientation: z
    .boolean()
    .optional()
    .describe('Also keep the part turned as in the modeled pose (feet flat on the floor)'),
});
export const ROBOT = z
  .string()
  .max(80)
  .optional()
  .describe(
    'Which robot, by name (from get_rig), when the scene has several; defaults to the selected one. Each robot keeps its own pose and animations.',
  );
export const PREVIEW = z
  .object({ frames: z.number().int().min(2).max(8).optional(), view: VIEW.optional() })
  .optional()
  .describe('Render evenly spaced frames to check the motion (side view shows gaits best)');
