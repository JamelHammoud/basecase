import { z } from 'zod';
import { settledWrites } from './pendingWrites.mjs';
import { bridge, fail, text } from './shared.mjs';

export const lightenPart = {
  name: 'lighten_part',
  config: {
    title: 'Lighten part',
    description:
      'Removes material from one printed scene part using its Strength loads and the same action as Lighten in the part menu. Preserves mounting regions and applies the requested wall scale to new webs. Requires a measured Strength load path. target_share is the requested fraction of original estimated printed mass to retain, default 0.5. Mounting and wall constraints can keep the result above that target. Returns the actual mass share or a reason the part could not be lightened.',
    inputSchema: {
      id: z.string().trim().min(1).max(200).describe('The printed scene part’s id from get_scene'),
      target_share: z
        .number()
        .gt(0)
        .lt(1)
        .default(0.5)
        .describe('Requested fraction of original estimated printed mass to retain'),
      min_wall_mm: z.number().min(1).optional().describe('Minimum wall thickness in millimeters, at least 1 mm'),
    },
  },
  handler: async (payload) => {
    try {
      await settledWrites();

      const res = await bridge('lighten_part', payload, 300000);

      return text(res?.text || 'Couldn’t lighten the part.');
    } catch (err) {
      return fail(err);
    }
  },
};
