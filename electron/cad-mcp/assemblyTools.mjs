import { bridge, fail, text } from './shared.mjs';

export const checkAssembly = {
  name: 'check_assembly',
  config: {
    title: 'Check assembly',
    description:
      'Checks that the model can be put together and serviced, from the real geometry. Fastener chains: for every screw, what it clamps, what its thread ends in (insert, nut, catalog part or printed part) and how much thread engages (at least 1.5 × D in plastic, or the insert length if shorter); tips in air, shanks through uncut material, heads with nothing under them, tips running past their insert. ' +
      'What holds each part: a fastener, or a pocket that captures it; plain contact does not count, and a strap or tape that only exists in a note is listed as unverified. ' +
      'Then the build order, found by taking the model apart: screws no driver can reach (straight driver, L-key or ball-end), screws to drive before another part goes on (build notes), how many steps it takes to replace the battery, electronics and servos (EN 45554 steps; targets 2, 5 and 10), and shells that wrap their contents and need a split, with the plane to split on. ' +
      'Every row is a warning for now. At most 12 lines, worst first, each naming the parts and the fix. Run it after each subassembly that has fasteners and before you finish.',
    inputSchema: {},
  },
  handler: async () => {
    try {
      const res = await bridge('assembly', {}, 240000);

      return text(res?.text || 'Nothing to check yet.');
    } catch (err) {
      return fail(err);
    }
  },
};
