import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const feet = z.object({ length: z.number().positive().optional(), width: z.number().positive().optional() });
const base = { id: z.string().min(1).max(80), label: z.string().min(1).max(120).optional() };
const parts = z.array(z.string().min(1)).min(1).optional();
const values = (value) => z.array(value).min(1).max(64);
const lens = z.discriminatedUnion('model', [
  z.object({ model: z.literal('pinhole'), hfovDeg: z.number().min(20).max(120) }),
  z.object({ model: z.literal('fisheye'), fovDeg: z.number().min(120).max(240) }),
]);
const knob = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('servo'), joints: z.array(z.string()).min(1), values: values(z.string()) }),
  z.object({ ...base, kind: z.literal('voltage'), values: values(z.number().finite().positive()) }),
  z.object({ ...base, kind: z.literal('battery'), parts, values: values(z.string()) }),
  z.object({ ...base, kind: z.literal('battery_offset'), parts, values: values(vector) }),
  z.object({ ...base, kind: z.literal('foot'), parts, values: values(feet) }),
  z.object({
    ...base,
    kind: z.literal('camera_pose'),
    part: z.string().min(1),
    values: values(z.object({ position: vector, rotation: vector })),
  }),
  z.object({ ...base, kind: z.literal('camera_lens'), part: z.string().min(1), values: values(lens) }),
  z.object({
    ...base,
    kind: z.literal('dimension'),
    part: z.string().min(1),
    name: z.string().min(1),
    values: values(z.number().finite()),
  }),
]);

export const studyDesign = {
  name: 'study_design',
  config: {
    title: 'Study design options',
    description:
      'Compares combinations of design knobs on copies of the scene without editing it. Knobs can choose servos for joints, supply voltage, batteries, battery offsets, foot scales, camera poses and supported lenses, or a named model dimension. ' +
      'Camera poses use absolute position in millimeters and XYZ rotation in degrees in the agent frame. Rigidly connected mount parts move together. Camera lens angles are supplied by the person, not inferred sensor specifications. ' +
      'visibility pins a saved simulated Case try, camera part IDs, target IDs with minimum pixel areas and 2 to 32 samples at 320 by 240. With visibility, use only camera knobs and provide case. Rows report sampled geometric visibility, not detector accuracy or readiness, without rerunning the Case. Multi-camera visibility uses any camera meeting each target threshold at each sample. ' +
      'Offsets use millimeters in the agent frame (Z up, front −Y). Scales use 1 for the current size. Dimension names come from get_part_code. ' +
      'The current design is measured first, followed by at most cap combinations (64 by default), sampled reproducibly with seed. Each row includes engineering checks, static torque, servo price, cost, mass, stability and available runtime. ' +
      'With case and no visibility request, also runs that Case 8 times per design with the same seeds and returns passes and worst margin. With no knobs or parameter, discovers the scene’s available knobs and uses the open Case when present. ' +
      'The previous single parameter form remains accepted: parameter servo uses joints and servos, battery_offset uses offsets_mm, foot_scale uses feet. ' +
      'Returns { ok, text, current, designs, rows, knobs, seed, case?, runs? }, retaining the sweep table and Case comparison fields. Results also appear in Study, where the user can apply a row. Report cost and measured margins. Visibility does not establish Case passes.',
    inputSchema: {
      case: z.string().min(1).max(120).optional().describe('Case id or name'),
      knobs: z.array(knob).min(1).max(64).optional(),
      visibility: z
        .object({
          tryId: z.string().min(1),
          cameras: z.array(z.string().min(1)).min(1).max(8),
          targets: z
            .array(z.object({ id: z.string().min(1), minPixels: z.number().int().min(1).max(76800) }))
            .min(1)
            .max(16),
          samples: z.number().int().min(2).max(32),
        })
        .optional(),
      cap: z.number().int().min(1).max(64).optional(),
      seed: z.number().int().min(0).max(4294967295).optional(),
      parameter: z.enum(['servo', 'battery_offset', 'foot_scale']).optional(),
      joints: z.array(z.string()).optional(),
      servos: values(z.string()).optional(),
      offsets_mm: values(vector).optional(),
      feet: values(feet).optional(),
    },
  },
  handler: async (args) => {
    try {
      const result = await bridge('study_design', args, 600000);

      return { ...text(result), structuredContent: result };
    } catch (err) {
      return fail(err);
    }
  },
};
