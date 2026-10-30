import { z } from 'zod';
import { renderPart } from '../cad-kernel/client.mjs';
import { expectSchema, resolveExpect } from './expectations.mjs';
import { trackWrite } from './pendingWrites.mjs';
import { auditText, storedAudit } from './partAudit.mjs';
import { common, idSchema, vec3 } from './schemas.mjs';
import { bridge, clashText, fail, text } from './shared.mjs';

const OPENSCAD_HELP =
  'language "openscad" (default): OpenSCAD with BOSL2 and the robotics library: start with `include <robotics.scad>` (which includes BOSL2/std.scad). ' +
  'Prefer BOSL2: cuboid(size, rounding=, chamfer=, edges=, except=), cyl(d=, h=, rounding1/2=, chamfer=), tube(), prismoid(), rounded_prism(), offset_sweep(), skin() for lofts, rotate_sweep(), path_sweep(), ' +
  'diff()/tag("remove") for holes and pockets, attach()/position()/anchor= for features, grid_copies()/xcopies()/rot_copies() for patterns, xflip_copy() for symmetry. ' +
  'Library: servo(STS3215|MG996R|SG90|XL430|XL330), servo_pocket(s, clearance=0.25, extend=), servo_horn_round(), qdd_actuator(QDD_S|QDD_M|QDD_L) and qdd_pocket() for pancake joint actuators, wheel(d, w), caster(d), servo_u_bracket(s, reach=) (output link of a servo joint: horn cheek + idler cheek + web), linear_lift(stroke, width, at) (rails, carriage, lead screw, NEMA 17), parallel_gripper(open, finger) (rack-and-pinion body, finger carriages, TPU pads), socket_screw(d,l), socket_head(), servo_link(), servo_base(), screw_clearance(d, depth), heatset_hole(m, depth), bearing_608(), pi_zero(), pi5(), cell_18650(), rect_holes(w,h); proven modules with ports (shell seams, servo cradles and links, battery bays, board trays, gears, hinges): find_recipes. ' +
  'Servo modules have their origin on the output shaft at the top of the case; the case extends down and along −X.\n';

const REPLICAD_HELP =
  'language "replicad": OpenCascade B-rep in JavaScript. Use it for lofts through several sections, fillets on edges a boolean created, and B-rep shells; OpenSCAD silhouette intersection is the default for heads and shells (the shells guide). The code is a function body that must `return` a shape. drawPointsInterpolation(points) draws a smooth spline through 2D points. ' +
  'All replicad exports are in scope: drawRoundedRectangle(w,h,r), drawCircle(r), drawRectangle, draw().lineTo().arc..close(), drawPolysides; .sketchOnPlane("XY"|"XZ"|"YZ", origin) then .extrude(h), .revolve(), .loftWith(otherSketch) (XY and YZ sit at +origin and extrude along +Z / +X; XZ sits at y = −origin and extrudes toward −Y, and edge finders like inPlane("XZ", v) use the same sign); ' +
  'makeCylinder(r,h,[x,y,z],[dx,dy,dz]), makeBox([x0,y0,z0],[x1,y1,z1]), makeSphere(r); shape.fillet(r, e => e.inPlane("XY", z)), .chamfer(), .shell(t, f => f.inPlane("XY", z)), .fuse(), .cut(), .intersect(), .translate([x,y,z]), .rotate(deg,[0,0,0],[0,0,1]), .mirror("YZ"). ' +
  'Edge helpers that return edge lists: edgeKeys(shape) before a boolean, then newEdges(keys, result) for the edges it created; convexEdges(shape, { minAngle: 20, outer: true }) for the outer envelope; edgesOnPlane(shape, "XY", z). ' +
  'filletEdges(shape, r, edges, label) and chamferEdges(shape, size, edges, label) blend exactly those edges, fall back edge by edge (and to half size) when the whole set fails, and report "fillet hit N of M intended edges".\n';

const PORT_HELP =
  'Ports (named interfaces other parts mate to), in the code frame: OpenSCAD `echo("PORT", "name", [x,y,z], [ax,ay,az], "bore"|"boss"|"face"|"output"|"hole_circle"|"screw", diameter);` at top level; replicad `return { shape, ports: [{ name, position, axis, kind, diameter }] }`. ' +
  'The axis points out of the part. Bores, screws, bosses and faces are checked against the mesh.\n';

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

async function visibleShare(id) {
  try {
    return (await bridge('visible_share', { id }, 30000)).share;
  } catch {
    return null;
  }
}

async function previousRecord(id) {
  try {
    return await bridge('part_record', { id }, 10000);
  } catch {
    return null;
  }
}

function cadPayload({ language, code, res, expect }) {
  return {
    language,
    code,
    positions: res.positions,
    indices: res.indices,
    edges: res.edges,
    stats: res.stats,
    ...(res.audit?.ports?.length ? { ports: res.audit.ports } : {}),
    ...(storedAudit(res.audit) ? { audit: storedAudit(res.audit) } : {}),
    ...(expect ? { expect } : {}),
  };
}

export const modelPart = {
  name: 'model_part',
  config: {
    title: 'Model part',
    description:
      'Designs ONE real part as code, compiles it with the CAD kernel, and places it live. Re-use an id to replace a block-out or improve a part.\n' +
      OPENSCAD_HELP +
      REPLICAD_HELP +
      PORT_HELP +
      'Model each part in its own local frame around a meaningful datum (e.g. the joint axis at the origin), then place it with position (where the local origin goes) and rotation. ' +
      'Returns the local bounding box, volume and triangle count, an audit (bodies, genus, edges where solids only touch, change since the last revision, craft hints) and your requirements as pass/fail. Compile errors come back as text: fix and call again.',
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
      expect: expectSchema,
      ...common,
    },
  },
  handler: async ({ id, language, code, position, expect_size, expect: given, ...rest }) => {
    try {
      bridge('focus', { id, label: `Designing ${rest.name ?? id}`, position }, 5000).catch(() => {});

      const previous = await previousRecord(id);
      const { expect, changes } = resolveExpect(given, previous?.expect ?? undefined);
      const res = await renderPart(language, code, { expect });

      if (!res.ok) return fail(`${language} compile failed for ${id}:\n${res.error}`);

      const mismatch = sizeMismatch(id, res, expect_size);

      if (mismatch) return fail(mismatch + auditText({ audit: res.audit, previous, stats: res.stats, changes }));

      const part = { id, shape: 'cad_part', position, ...rest, cad: cadPayload({ language, code, res, expect }) };
      const placed = await bridge('apply', { ops: [{ op: 'add', part }] });
      const s = res.stats;
      const share = await visibleShare(id);

      return text(
        `Placed ${id} (${res.ms} ms). Local bbox min [${s.bbox.min}] max [${s.bbox.max}] size [${s.bbox.size}] mm, volume ${s.volume} mm³, ${s.triangles} triangles.` +
          (res.warnings?.length ? `\nWarnings:\n${res.warnings.join('\n')}` : '') +
          auditText({ audit: res.audit, previous, stats: s, changes, share }) +
          (placed.summary ? `\n${placed.summary}` : '') +
          (await clashText([id])),
      );
    } catch (err) {
      return fail(err);
    }
  },
};

const compileAndPlace = modelPart.handler;

modelPart.handler = (args) => trackWrite([args.id], compileAndPlace(args));
