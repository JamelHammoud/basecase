import { z } from 'zod';
import { renderPart } from '../cad-kernel/client.mjs';
import { catalogSchema, common, idSchema, primitiveSchema, vec3 } from './schemas.mjs';
import { bridge, clashText, fail, text } from './shared.mjs';

export const getScene = {
  name: 'get_scene',
  config: {
    title: 'Read scene',
    description:
      'Lists every part: id, name, kind (cad part or primitive), placement, world bounding box [min,max] in mm (z up), color, group, role. CAD parts also report volume. Call first, and whenever the user may have edited the scene.',
    inputSchema: {},
  },
  handler: async () => {
    try {
      return text(await bridge('snapshot', {}));
    } catch (err) {
      return fail(err);
    }
  },
};

function sizeMismatch(id, res, expectSize) {
  if (!expectSize) return '';

  const got = res.stats.bbox.size;
  const off = [0, 1, 2].filter((k) => Math.abs(got[k] - expectSize[k]) > Math.max(1, 0.03 * expectSize[k]));

  if (!off.length) return '';

  return (
    `${id} not placed: its size is [${got.map((v) => +v.toFixed(2)).join(', ')}] mm, expected [${expectSize.join(', ')}] (off in ${off.map((k) => 'xyz'[k]).join(', ')}). ` +
    `Local bbox min [${res.stats.bbox.min}] max [${res.stats.bbox.max}]. Fix the code, or the expectation if the design changed.`
  );
}

export const modelPart = {
  name: 'model_part',
  config: {
    title: 'Model part',
    description:
      'Designs ONE real part as code, compiles it with the CAD kernel, and places it live. Re-use an id to replace a block-out or improve a part.\n' +
      'language "openscad" (default): OpenSCAD with BOSL2 and the robotics library: start with `include <robotics.scad>` (which includes BOSL2/std.scad). ' +
      'Prefer BOSL2: cuboid(size, rounding=, chamfer=, edges=, except=), cyl(d=, h=, rounding1/2=, chamfer=), tube(), prismoid(), rounded_prism(), offset_sweep(), skin() for lofts, rotate_sweep(), path_sweep(), ' +
      'diff()/tag("remove") for holes and pockets, attach()/position()/anchor= for features, grid_copies()/xcopies()/rot_copies() for patterns, xflip_copy() for symmetry. ' +
      'Library: servo(STS3215|MG996R|SG90|XL430|XL330), servo_pocket(s, clearance=0.25, extend=), servo_horn_round(), qdd_actuator(QDD_S|QDD_M|QDD_L) and qdd_pocket() for pancake joint actuators, wheel(d, w), caster(d), servo_u_bracket(s, reach=) (output link of a servo joint: horn cheek + idler cheek + web), linear_lift(stroke, width, at) (rails, carriage, lead screw, NEMA 17), parallel_gripper(open, finger) (rack-and-pinion body, finger carriages, TPU pads), socket_screw(d,l), screw_clearance(d, depth), heatset_hole(m, depth), bearing_608(), pi_zero(), pi5(), cell_18650(), rect_holes(w,h). ' +
      'Servo modules have their origin on the output shaft at the top of the case; the case extends down and along −X.\n' +
      'language "replicad": OpenCascade B-rep in JavaScript. Use it for every sculpted shell (heads, torsos, covers, bases: the profileBody recipe from the instructions, splines through traced outlines), die-cast housings, true fillets after booleans and lofts. The code is a function body that must `return` a shape. drawPointsInterpolation(points) draws a smooth spline through 2D points. ' +
      'All replicad exports are in scope: drawRoundedRectangle(w,h,r), drawCircle(r), drawRectangle, draw().lineTo().arc..close(), drawPolysides; .sketchOnPlane("XY"|"XZ"|"YZ", origin) then .extrude(h), .revolve(), .loftWith(otherSketch) (XY and YZ sit at +origin and extrude along +Z / +X; XZ sits at y = −origin and extrudes toward −Y, and edge finders like inPlane("XZ", v) use the same sign); ' +
      'makeCylinder(r,h,[x,y,z],[dx,dy,dz]), makeBox([x0,y0,z0],[x1,y1,z1]), makeSphere(r); shape.fillet(r, e => e.inPlane("XY", z)), .chamfer(), .shell(t, f => f.inPlane("XY", z)), .fuse(), .cut(), .intersect(), .translate([x,y,z]), .rotate(deg,[0,0,0],[0,0,1]), .mirror("YZ").\n' +
      'Model each part in its own local frame around a meaningful datum (e.g. the joint axis at the origin), then place it with position (where the local origin goes) and rotation. ' +
      'Returns the local bounding box, volume and triangle count; compare them with what you intended. Compile errors come back as text: fix and call again.',
    inputSchema: {
      id: idSchema,
      language: z.enum(['openscad', 'replicad']).default('openscad'),
      code: z.string().min(5).max(40000),
      position: vec3.describe('Where the code origin goes in the world, mm, z up').default([0, 0, 0]),
      expect_size: vec3
        .optional()
        .describe(
          'The local bounding-box size [x, y, z] you designed for, mm. The part is rejected (not placed) if the compiled size is off by more than 1 mm or 3%, so mistakes in offsets and booleans surface at once.',
        ),
      ...common,
    },
  },
  handler: async ({ id, language, code, position, expect_size, ...rest }) => {
    try {
      bridge('focus', { id, label: `Designing ${rest.name ?? id}`, position }, 5000).catch(() => {});

      const res = await renderPart(language, code);

      if (!res.ok) return fail(`${language} compile failed for ${id}:\n${res.error}`);

      const mismatch = sizeMismatch(id, res, expect_size);

      if (mismatch) return fail(mismatch);

      const placed = await bridge('apply', {
        ops: [
          {
            op: 'add',
            part: {
              id,
              shape: 'cad_part',
              position,
              ...rest,
              cad: {
                language,
                code,
                positions: res.positions,
                indices: res.indices,
                edges: res.edges,
                stats: res.stats,
              },
            },
          },
        ],
      });
      const s = res.stats;

      return text(
        `Placed ${id} (${res.ms} ms). Local bbox min [${s.bbox.min}] max [${s.bbox.max}] size [${s.bbox.size}] mm, volume ${s.volume} mm³, ${s.triangles} triangles.` +
          (res.warnings?.length ? `\nWarnings:\n${res.warnings.join('\n')}` : '') +
          (placed.summary ? `\n${placed.summary}` : '') +
          (await clashText([id])),
      );
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
      'Returns the code and language of a CAD part, so you can edit it and call model_part again with the same id.',
    inputSchema: { id: z.string() },
  },
  handler: async ({ id }) => {
    try {
      return text(await bridge('part_code', { id }));
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
      'Mirrored copies for symmetry: axis "x" mirrors left/right (x → −x), axis "y" mirrors front/back (y → −y). CAD geometry is mirrored too. ' +
      'Copy ids/names swap left↔right (or front↔rear for axis y) unless you pass rename { sourceId: newId }.',
    inputSchema: {
      ids: z.array(z.string()).min(1).max(60),
      axis: z.enum(['x', 'y']).default('x'),
      rename: z.record(z.string(), z.string()).optional(),
    },
  },
  handler: async ({ ids, axis, rename }) => {
    try {
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
      'Returns catalog keys with exact sizes, key specs and mounting details (hole patterns, horn and bracket interfaces). Place them with add_parts({ catalog }) and design your brackets and pockets around their real dimensions. ' +
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
