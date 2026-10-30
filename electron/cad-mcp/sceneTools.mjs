import { noteBlockOut } from './autoCompare.mjs';
import { z } from 'zod';
import { catalogSchema, common, idSchema, primitiveSchema, vec3 } from './schemas.mjs';
import { findInScene } from './sceneQuery.mjs';
import { sceneText } from './sceneText.mjs';
import { settledWrites } from './pendingWrites.mjs';
import { bridge, clashText, fail, text } from './shared.mjs';

export const getScene = {
  name: 'get_scene',
  config: {
    title: 'Read scene',
    description:
      'Lists the parts, one per line: id, name, kind, group, pos (placement), rot, size (or vol for CAD parts), box (world bounding box min..max), color, role, material, catalog or supply key, note. All in mm, z up. `Marks` (when present) lists the strokes the user drew on the canvas: colour, label (what the user means by it), the parts each one circles or crosses, its bounds, and seenFrom (the look view it was drawn from). ' +
      'Over 20 parts, the whole scene comes back as a summary per group (box and ids); pass group or ids for the full lines, or use find_in_scene. Call first, and whenever the user may have edited the scene.',
    inputSchema: {
      ids: z.array(idSchema).optional().describe('Only these parts'),
      group: z.string().optional().describe('Only the parts in this group (its name, as listed)'),
    },
  },
  handler: async ({ ids, group }) => {
    try {
      return text(sceneText(await bridge('snapshot', {}), { ids, group }));
    } catch (err) {
      return fail(err);
    }
  },
};

const box = z.object({ min: vec3, max: vec3 });

export const findInSceneTool = {
  name: 'find_in_scene',
  config: {
    title: 'Find in scene',
    description:
      'Finds parts by any mix of: words in the id, name, group, kind or catalog key (all must match); group; kind (e.g. "hardware", "cad", "component:sts3215", "M3"); a world region box; or near a point. Returns full part lines, nearest first with near. Use it instead of reading the whole scene.',
    inputSchema: {
      query: z.string().max(80).optional(),
      group: z.string().max(60).optional(),
      kind: z.string().max(60).optional(),
      region: box.optional().describe('World box, mm, z up: parts whose bounds overlap it'),
      near: z
        .object({ point: vec3, radius: z.number().positive().max(5000) })
        .optional()
        .describe('Parts within radius mm of a world point'),
    },
  },
  handler: async (filter) => {
    try {
      return text(findInScene(await bridge('snapshot', {}), filter));
    } catch (err) {
      return fail(err);
    }
  },
};

export const getPartCode = {
  name: 'get_part_code',
  config: {
    title: 'Read part code',
    description:
      'Returns the code and language of a CAD part, so you can edit it and call model_part again with the same id. An unknown id lists the closest ids.',
    inputSchema: { id: z.string() },
  },
  handler: async ({ id }) => {
    try {
      return text((await bridge('part_code', { id })).text);
    } catch (err) {
      return fail(err);
    }
  },
};

export const addParts = {
  name: 'add_parts',
  config: {
    title: 'Block out',
    description:
      'Quick placeholder blocks for planning proportions BEFORE real modeling (coarse to fine). One subassembly per call. Replace each block with model_part using the same id. ' +
      'Shapes are simple primitives; cylinder, tube, capsule, cone, hex_prism, standoff and pivot_axis run along +Z (diameter = x, length = z). servo is a generic hobby servo block. ' +
      'Also places REAL catalog parts (from find_parts) with { id, catalog, position, rotation }: exact manufacturer geometry for servos, motors, boards, sensors, cameras, grippers, hands, screws, inserts and bearings. Those stay in the final model; check their orientation with look(ids) and rotate as needed.',
    inputSchema: {
      parts: z
        .array(z.union([catalogSchema, primitiveSchema]))
        .min(1)
        .max(30),
    },
  },
  handler: async ({ parts }) => {
    try {
      const res = await bridge('apply', { ops: parts.map((p) => ({ op: 'add', part: p })) });
      const real = parts.filter((p) => p.catalog).map((p) => p.id);

      noteBlockOut();

      return text((res.summary || `Added ${parts.length} blocks.`) + (real.length ? await clashText(real) : ''));
    } catch (err) {
      return fail(err);
    }
  },
};

export const updateParts = {
  name: 'update_parts',
  config: {
    title: 'Move or restyle parts',
    description:
      "Changes placement (position, rotation), color, name, group, role, material or note of existing parts by id. For primitives you can also change size. To change a CAD part's geometry, call model_part again.",
    inputSchema: {
      updates: z
        .array(
          z.object({
            id: z.string(),
            position: vec3.optional(),
            size: vec3.optional(),
            ...Object.fromEntries(Object.entries(common).map(([k, v]) => [k, v.optional()])),
          }),
        )
        .min(1)
        .max(60),
    },
  },
  handler: async ({ updates }) => {
    try {
      const res = await bridge('apply', { ops: updates.map((u) => ({ op: 'update', part: u })) });

      return text(res.summary || `Updated ${updates.length} parts.`);
    } catch (err) {
      return fail(err);
    }
  },
};

export const deleteParts = {
  name: 'delete_parts',
  config: {
    title: 'Delete parts',
    description: 'Removes parts by id.',
    inputSchema: { ids: z.array(z.string()).min(1).max(80) },
  },
  handler: async ({ ids }) => {
    try {
      const res = await bridge('apply', { ops: ids.map((id) => ({ op: 'delete', id })) });

      return text(res.summary || `Deleted ${ids.length} parts.`);
    } catch (err) {
      return fail(err);
    }
  },
};

export const mirrorParts = {
  name: 'mirror_parts',
  config: {
    title: 'Mirror parts',
    description:
      'Mirrored copies for symmetry: axis "x" mirrors left/right (x → −x), axis "y" mirrors front/back (y → −y). CAD geometry and code are mirrored (the copy’s code is the source wrapped in mirror()). ' +
      'Catalog parts (servos, boards, screws) can’t be mirrored, so each copy is placed by its datum: its output axis, holes and ports land exactly on the mirrored ones. ' +
      'Copy ids/names swap left↔right (or front↔rear for axis y) unless you pass rename { sourceId: newId }. Copies stay linked to their source: mirroring the source again replaces its old copy, and editing either side reminds you to re-mirror.',
    inputSchema: {
      ids: z.array(z.string()).min(1).max(60),
      axis: z.enum(['x', 'y']).default('x'),
      rename: z.record(z.string(), z.string()).optional(),
    },
  },
  handler: async ({ ids, axis, rename }) => {
    try {
      await settledWrites(ids);

      const res = await bridge('apply', { ops: [{ op: 'mirror', ids, axis, rename: rename ?? {} }] });

      return text(res.summary || `Mirrored ${ids.length} parts.`);
    } catch (err) {
      return fail(err);
    }
  },
};

export const findParts = {
  name: 'find_parts',
  config: {
    title: 'Find parts',
    description:
      "Searches the studio's catalog of real, purchasable parts with exact CAD geometry: servos (Feetech, Dynamixel…), motors, robot hands and grippers, computers (Raspberry Pi, Jetson…), microcontrollers, drivers, sensors, LiDAR, depth cameras and cameras, plus ISO screws, nuts, washers, heat-set inserts, standoffs, dowel pins and bearings. " +
      'Returns catalog keys with exact sizes, key specs, mounting details (hole patterns, horn and bracket interfaces) and prices: the price the user checked, else a dated list price with its store. Actuators also show N·m per dollar and, once joints are declared, their margin at the scene’s hardest leg and holding joints; the remaining budget heads the list when one is set. Place them with add_parts({ catalog }) and design your brackets and pockets around their real dimensions. ' +
      'Pass a few words to filter (e.g. "servo", "depth camera", "raspberry"), or nothing to list everything.',
    inputSchema: { query: z.string().max(80).optional() },
  },
  handler: async ({ query }) => {
    try {
      const res = await bridge('catalog', { query: query ?? '' });

      return text(res?.text || 'The catalog is empty.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const setStatus = {
  name: 'set_status',
  config: {
    title: 'Status',
    description:
      'Shows a short status line in the app, e.g. "Designing the coxa bracket". Under 6 words. Call when you change stage or part.',
    inputSchema: { status: z.string().min(1).max(60) },
  },
  handler: async ({ status }) => {
    try {
      await bridge('status', { status }, 10000);

      return text('ok');
    } catch (err) {
      return fail(err);
    }
  },
};
