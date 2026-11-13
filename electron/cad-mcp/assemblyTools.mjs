import { z } from 'zod';
import { settledWrites } from './pendingWrites.mjs';
import { bridge, fail, text } from './shared.mjs';

export const checkAssembly = {
  name: 'check_assembly',
  config: {
    title: 'Check assembly',
    description:
      'Checks that the model can be put together and serviced, from the real geometry. Fastener chains: for every screw, what it clamps, what its thread ends in (insert, nut, catalog part or printed part) and how much thread engages (at least 1.5 × D in plastic, or the insert length if shorter); tips in air, shanks through uncut material, heads with nothing under them, tips running past their insert. ' +
      'What holds each part: a fastener, or a pocket that captures it; plain contact does not count, and a strap or tape that only exists in a note is listed as unverified. ' +
      'Then the build order, found by taking the model apart: screws no driver can reach (straight driver, L-key or ball-end), screws to drive before another part goes on (build notes), how many steps it takes to replace the battery, electronics and servos (EN 45554 steps; targets 2, 5 and 10), and shells that wrap their contents and need a split, with the plane to split on. ' +
      'Rows marked BLOCKER count against get_readiness; the rest are notes. At most 12 lines, worst first, each naming the parts and the fix. ' +
      'Last, printed parts of one material bolted together on one rigid link that could print as one part, with what that saves and the part left out when merging all of them would seal a servo, block the order, overflow the bed or add support. Run it after each subassembly that has fasteners.',
    inputSchema: {},
  },
  handler: async () => {
    try {
      await settledWrites();

      const res = await bridge('assembly', {}, 240000);

      return text(res?.text || 'Nothing to check yet.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const mergeParts = {
  name: 'merge_parts',
  config: {
    title: 'Merge parts',
    description:
      'Unions printed parts that check_assembly lists under "Could print as one part" into one printed part, and removes the screws and inserts that only joined them, in one undo step. Pass one listed ids array as it is. It checks again first, and refuses a merge that no longer prints or assembles. Use it only when the user asks to merge or cut the part count.',
    inputSchema: { ids: z.array(z.string()).min(2).max(40) },
  },
  handler: async ({ ids }) => {
    try {
      await settledWrites(ids);

      const res = await bridge('merge', { ids }, 240000);

      return text(res?.text || 'Nothing merged.');
    } catch (err) {
      return fail(err);
    }
  },
};
