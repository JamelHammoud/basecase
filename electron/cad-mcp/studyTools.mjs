import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const feet = z.object({ length: z.number().positive().optional(), width: z.number().positive().optional() });
const base = { id: z.string().min(1).max(80), label: z.string().min(1).max(120).optional() };
const parts = z.array(z.string().min(1)).min(1).optional();
const values = (value) => z.array(value).min(1).max(64);
const knob = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('servo'), joints: z.array(z.string()).min(1), values: values(z.string()) }),
  z.object({ ...base, kind: z.literal('voltage'), values: values(z.number().finite().positive()) }),
  z.object({ ...base, kind: z.literal('battery'), parts, values: values(z.string()) }),
  z.object({ ...base, kind: z.literal('battery_offset'), parts, values: values(vector) }),
  z.object({ ...base, kind: z.literal('foot'), parts, values: values(feet) }),
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
      'Compares combinations of design knobs on copies of the scene without editing it. Knobs can choose servos for joints, supply voltage, batteries, battery offsets, foot scales or a named model dimension. ' +
      'Offsets use millimeters in the agent frame (Z up, front −Y). Scales use 1 for the current size. Dimension names come from get_part_code. ' +
      'The current design is measured first, followed by at most cap combinations (64 by default), sampled reproducibly with seed. Each row includes engineering checks, static torque, servo price, cost, mass, stability and available runtime. ' +
      'With case, also runs that Case 8 times per design with the same seeds and returns passes and worst margin. With no knobs or parameter, discovers the scene’s available knobs and uses the open Case when present. ' +
      'The previous single parameter form remains accepted: parameter servo uses joints and servos, battery_offset uses offsets_mm, foot_scale uses feet. ' +
      'Returns { ok, text, current, designs, rows, knobs, seed, case?, runs? }, retaining the sweep table and Case comparison fields. Results also appear in Study, where the user can apply a row. Recommend a passing design with its cost and margin.',
    inputSchema: {
      case: z.string().min(1).max(120).optional().describe('Case id or name'),
      knobs: z.array(knob).min(1).max(64).optional(),
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
