import { z } from 'zod';

const axis = z.enum(['x', 'y', 'z']);

export const expectSchema = z
  .object({
    holes: z
      .array(
        z.object({
          count: z.number().int().min(0).max(200),
          d: z.number().positive().max(200).describe('Diameter, mm'),
          axis: axis.default('z').describe('Local axis the holes run along'),
          through: z.boolean().default(true).describe('Blind holes are not measured; declare them as bore ports'),
        }),
      )
      .max(12)
      .optional(),
    min_wall_mm: z.number().positive().max(50).optional(),
    flat_base: z.boolean().optional().describe('A flat face at the lowest local z (the print bed side)'),
    symmetric: z
      .array(axis)
      .max(3)
      .optional()
      .describe('Mirror-symmetric across the bounding-box centre on these axes'),
    genus: z.number().int().min(0).max(500).optional().describe('Through holes and handles, for a clean solid'),
    bodies: z.number().int().min(1).max(50).optional(),
  })
  .optional()
  .describe(
    'Requirements the compiled part must meet, measured on every compile. They are frozen per part id: omit expect later to keep them; any change is reported.',
  );

const show = (v) => (v === undefined ? 'none' : JSON.stringify(v));

export function resolveExpect(given, previous) {
  if (given === undefined) return { expect: previous ?? undefined, changes: [] };

  if (!previous) return { expect: given, changes: [] };

  const keys = [...new Set([...Object.keys(previous), ...Object.keys(given)])];
  const diffs = keys
    .filter((k) => JSON.stringify(previous[k]) !== JSON.stringify(given[k]))
    .map((k) => `${k} ${show(previous[k])} → ${show(given[k])}`);

  if (!diffs.length) return { expect: given, changes: [] };

  const removed = keys.filter((k) => previous[k] !== undefined && given[k] === undefined);

  return {
    expect: given,
    changes: [
      `Requirements changed from the last revision: ${diffs.join('; ')}.${removed.length ? ` Dropped: ${removed.join(', ')}.` : ''} Tell the user why in your reply.`,
    ],
  };
}
