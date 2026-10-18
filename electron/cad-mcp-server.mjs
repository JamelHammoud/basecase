#!/usr/bin/env node
/**
 * Robotics CAD MCP server.
 *
 * Claude Code (running through the ACP adapter) designs real parts here: each part is
 * OpenSCAD + BOSL2 (or replicad / OpenCascade) code compiled by a sandboxed CAD kernel
 * into geometry, then placed live in the app's canvas through a local HTTP bridge
 * (CAD_BRIDGE_URL), where the renderer shows it with the agent cursor.
 *
 * Frame for everything the agent sees: Z up, millimeters, floor z = 0, front faces −Y,
 * the object's left is +X. The app converts to its Y-up viewport.
 */
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CAD_AGENT_INSTRUCTIONS } from './cad-agent-prompt.mjs';
import { renderPart, warmUp } from './cad-kernel/client.mjs';
import { checkAgainstSkeleton, describeSkeleton, fetchSkeleton } from './robot-skeleton.mjs';

const BRIDGE_URL = process.env.CAD_BRIDGE_URL;
const EVIDENCE_DIR = process.env.CAD_EVIDENCE_DIR ? path.resolve(process.env.CAD_EVIDENCE_DIR) : null;
const REFERENCES_DIR = process.env.CAD_REFERENCES_DIR ? path.resolve(process.env.CAD_REFERENCES_DIR) : null;
// Benchmark runs can switch the web tools off (design from the given references only)
const NO_WEB = process.env.CAD_NO_WEB === '1';
const VIEW = z
  .string()
  .regex(/^(iso|front|side|top|back|az:-?\d+(\.\d+)?,el:-?\d+(\.\d+)?)$/, 'iso, front, side, top, back, or az:<deg>,el:<deg>');
const IMAGE_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

async function bridge(kind, payload, timeoutMs = 120000) {
  if (!BRIDGE_URL) throw new Error('CAD_BRIDGE_URL is not set; the app bridge is unavailable.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BRIDGE_URL}/agent/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(body.error || `Bridge error ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 1) }] });
const fail = (err) => ({ isError: true, content: [{ type: 'text', text: String(err?.message ?? err) }] });

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const SHAPES = [
  'box', 'cube', 'cylinder', 'tube', 'sphere', 'dome', 'capsule', 'cone', 'pyramid', 'hex_prism', 'wedge', 'torus',
  'servo', 'stepper_motor', 'l_bracket', 'u_bracket', 'standoff', 'wheel', 'bearing_block', 'pcb_board',
  'hole_cylinder', 'hole_box', 'pivot_axis',
];

const vec3 = z.array(z.number()).length(3);
const idSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
  .describe('Stable kebab-case id, unique in the scene, e.g. "left-front-coxa"');

const common = {
  name: z.string().min(1).max(60).describe('Title Case name, e.g. "Left Front Coxa Bracket"'),
  rotation: vec3.optional().describe('Euler degrees [rx, ry, rz], XYZ order, about the placement point. Default [0,0,0].'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex color sampled from the reference'),
  role: z.enum(['solid', 'cutout', 'reference']).optional().describe('solid (default), cutout, or reference (guide, not printed)'),
  group: z.string().max(40).optional().describe('Subassembly, e.g. "Left Front Leg". Parts sharing it are grouped.'),
  material: z
    .enum(['printed', 'pla', 'petg', 'asa', 'tpu', 'cots', 'aluminum', 'laser_cut'])
    .optional()
    .describe('printed (the project filament, default), pla, petg or asa (a specific filament: parts that hold or touch a servo need petg or asa, since servos run at 60–70 °C and PLA softens at 54 °C), tpu (soles, bumpers), cots (bought part), aluminum, laser_cut'),
  supply: z.string().regex(/^supply:[a-z0-9-]+$/).optional().describe('This part is the envelope of a bought supply from find_parts, e.g. "supply:lipo-3s-2200" for the battery: counted in the BOM, not printed'),
  note: z.string().max(400).optional().describe('Design intent: fasteners, clearances, print orientation, function'),
};

const primitiveSchema = z.object({
  id: idSchema,
  shape: z.enum(SHAPES),
  size: vec3.describe('[x, y, z] extents in mm before rotation (z is height)'),
  position: vec3.describe('Center [x, y, z] in mm; z up, floor z = 0'),
  thickness: z.number().positive().max(50).optional(),
  ...common,
});

const catalogSchema = z.object({
  id: idSchema,
  catalog: z
    .string()
    .regex(/^(component:[a-z0-9-]+(\|[a-z0-9]+)?|hardware:[a-z_]+(\|[^|]*){0,4})$/)
    .describe('Catalog key from find_parts, e.g. "component:feetech-sts3215|c018" (parts sold in versions need one) or "hardware:socket_head|M3|10"'),
  position: vec3.describe('Center [x, y, z] in mm of the part as placed'),
  ...common,
  name: common.name.optional(),
});

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

const server = new McpServer({ name: 'robotics_cad', version: '3.0.0' }, { instructions: CAD_AGENT_INSTRUCTIONS });

server.registerTool(
  'get_scene',
  {
    title: 'Read scene',
    description:
      'Lists every part: id, name, kind (cad part or primitive), placement, world bounding box [min,max] in mm (z up), color, group, role. CAD parts also report volume. Call first, and whenever the user may have edited the scene.',
    inputSchema: {},
  },
  async () => {
    try {
      return text(await bridge('snapshot', {}));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'model_part',
  {
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
        .describe('The local bounding-box size [x, y, z] you designed for, mm. The part is rejected (not placed) if the compiled size is off by more than 1 mm or 3%, so mistakes in offsets and booleans surface at once.'),
      ...common,
    },
  },
  async ({ id, language, code, position, expect_size, ...rest }) => {
    try {
      // Show where the agent is working while the kernel compiles
      bridge('focus', { id, label: `Designing ${rest.name ?? id}`, position }, 5000).catch(() => {});
      const res = await renderPart(language, code);
      if (!res.ok) return fail(`${language} compile failed for ${id}:\n${res.error}`);
      if (expect_size) {
        const got = res.stats.bbox.size;
        const off = [0, 1, 2].filter((k) => Math.abs(got[k] - expect_size[k]) > Math.max(1, 0.03 * expect_size[k]));
        if (off.length)
          return fail(
            `${id} not placed: its size is [${got.map((v) => +v.toFixed(2)).join(', ')}] mm, expected [${expect_size.join(', ')}] (off in ${off.map((k) => 'xyz'[k]).join(', ')}). ` +
              `Local bbox min [${res.stats.bbox.min}] max [${res.stats.bbox.max}]. Fix the code, or the expectation if the design changed.`
          );
      }
      const placed = await bridge('apply', {
        ops: [
          {
            op: 'add',
            part: {
              id,
              shape: 'cad_part',
              position,
              ...rest,
              cad: { language, code, positions: res.positions, indices: res.indices, edges: res.edges, stats: res.stats },
            },
          },
        ],
      });
      const s = res.stats;
      return text(
        `Placed ${id} (${res.ms} ms). Local bbox min [${s.bbox.min}] max [${s.bbox.max}] size [${s.bbox.size}] mm, volume ${s.volume} mm³, ${s.triangles} triangles.` +
          (res.warnings?.length ? `\nWarnings:\n${res.warnings.join('\n')}` : '') +
          (placed.summary ? `\n${placed.summary}` : '') +
          (await clashText([id]))
      );
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'get_part_code',
  {
    title: 'Read part code',
    description: 'Returns the code and language of a CAD part, so you can edit it and call model_part again with the same id.',
    inputSchema: { id: z.string() },
  },
  async ({ id }) => {
    try {
      return text(await bridge('part_code', { id }));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'add_parts',
  {
    title: 'Block out',
    description:
      'Quick placeholder blocks for planning proportions BEFORE real modeling (coarse to fine). One subassembly per call. Replace each block with model_part using the same id. ' +
      'Shapes are simple primitives; cylinder, tube, capsule, cone, hex_prism, standoff and pivot_axis run along +Z (diameter = x, length = z). servo is a generic hobby servo block. ' +
      'Also places REAL catalog parts (from find_parts) with { id, catalog, position, rotation }: exact manufacturer geometry for servos, motors, boards, sensors, cameras, grippers, hands, screws, inserts and bearings. Those stay in the final model; check their orientation with look(ids) and rotate as needed.',
    inputSchema: { parts: z.array(z.union([catalogSchema, primitiveSchema])).min(1).max(30) },
  },
  async ({ parts }) => {
    try {
      const res = await bridge('apply', { ops: parts.map((p) => ({ op: 'add', part: p })) });
      // Real catalog parts stay in the model, so check their fit right away (blocks are temporary)
      const real = parts.filter((p) => p.catalog).map((p) => p.id);
      return text((res.summary || `Added ${parts.length} blocks.`) + (real.length ? await clashText(real) : ''));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'update_parts',
  {
    title: 'Move or restyle parts',
    description:
      'Changes placement (position, rotation), color, name, group, role, material or note of existing parts by id. For primitives you can also change size. To change a CAD part\'s geometry, call model_part again.',
    inputSchema: {
      updates: z
        .array(
          z.object({
            id: z.string(),
            position: vec3.optional(),
            size: vec3.optional(),
            ...Object.fromEntries(Object.entries(common).map(([k, v]) => [k, v.optional()])),
          })
        )
        .min(1)
        .max(60),
    },
  },
  async ({ updates }) => {
    try {
      const res = await bridge('apply', { ops: updates.map((u) => ({ op: 'update', part: u })) });
      return text(res.summary || `Updated ${updates.length} parts.`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'delete_parts',
  {
    title: 'Delete parts',
    description: 'Removes parts by id.',
    inputSchema: { ids: z.array(z.string()).min(1).max(80) },
  },
  async ({ ids }) => {
    try {
      const res = await bridge('apply', { ops: ids.map((id) => ({ op: 'delete', id })) });
      return text(res.summary || `Deleted ${ids.length} parts.`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'mirror_parts',
  {
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
  async ({ ids, axis, rename }) => {
    try {
      const res = await bridge('apply', { ops: [{ op: 'mirror', ids, axis, rename: rename ?? {} }] });
      return text(res.summary || `Mirrored ${ids.length} parts.`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'look',
  {
    title: 'Look',
    description:
      'Renders the model and returns images. Views: iso, front (looking at the front, from −Y), back, side (from +X, the left side), top, or any angle as "az:<deg>,el:<deg>" (az 0 = front, 90 = left side, −90 = right side; el = degrees above horizontal). ' +
      'Pass ids to render only those parts (inspect one part or one subassembly up close). Use after every part or subassembly, and on the whole model after each stage.',
    inputSchema: {
      views: z.array(VIEW).min(1).max(4).default(['iso', 'front']),
      ids: z.array(z.string()).optional().describe('Only show these parts'),
    },
  },
  async ({ views, ids }) => {
    try {
      const res = await bridge('screenshot', { views, ids }, 60000);
      const content = [];
      for (const shot of res.images || []) {
        content.push({ type: 'text', text: `${shot.view} view${ids?.length ? ` (${ids.join(', ')})` : ''}` });
        const m = /^data:(image\/\w+);base64,(.+)$/.exec(shot.dataUrl || '');
        if (m) content.push({ type: 'image', mimeType: m[1], data: m[2] });
      }
      if (content.length === 0) content.push({ type: 'text', text: 'Nothing to render.' });
      return { content };
    } catch (err) {
      return fail(err);
    }
  }
);

/** Immediate fit feedback for parts just placed: what they pass through or sit flush against */
async function clashText(ids) {
  try {
    const { items = [], coplanar = [] } = (await bridge('interference', { ids }, 60000)) ?? {};
    const lines = [
      ...items.slice(0, 8).map((it) => `- ${it.a} ↔ ${it.b}: pass through each other, up to ${it.depthMm} mm deep. Cut a pocket or hole, or move one.`),
      ...coplanar.slice(0, 8).map((c) => `- ${c.a} / ${c.b}: ${c.areaMm2} mm² of flush same-facing surface (flickers). Set one 0.2–0.5 mm proud or inset.`),
    ];
    return lines.length ? `\nFit problems to fix now:\n${lines.join('\n')}` : '';
  } catch {
    return '';
  }
}

/** A reference image as a data URL: ref-N (chat images), an evidence path, or a web URL */
async function loadReference(ref) {
  const r = String(ref).trim();
  let buf, mime;
  if (/^ref-\d+$/i.test(r)) {
    if (!REFERENCES_DIR || !fs.existsSync(REFERENCES_DIR)) throw new Error('No reference images saved yet.');
    const file = fs.readdirSync(REFERENCES_DIR).find((f) => f.toLowerCase().startsWith(`${r.toLowerCase()}.`));
    if (!file) throw new Error(`${r} not found. The prompt lists the saved names (ref-N).`);
    buf = fs.readFileSync(path.join(REFERENCES_DIR, file));
    mime = IMAGE_EXT[path.extname(file).toLowerCase()];
  } else if (/^https?:\/\//i.test(r)) {
    if (NO_WEB) throw new Error('Web images are off in this session.');
    const res = await fetchWithTimeout(r, 25000);
    if (!res.ok) throw new Error(`The image URL returned ${res.status}.`);
    mime = (res.headers.get('content-type') || '').split(';')[0].trim() || IMAGE_EXT[path.extname(new URL(r).pathname).toLowerCase()];
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    const full = evidencePath(r);
    buf = fs.readFileSync(full);
    mime = IMAGE_EXT[path.extname(full).toLowerCase()];
  }
  if (!/^image\/(png|jpeg|webp|gif)$/.test(mime || '')) throw new Error(`${r} is not a PNG, JPEG, WebP or GIF image.`);
  if (buf.length > 20_000_000) throw new Error(`${r} is larger than 20 MB.`);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * The model's silhouette by height band, from part bounding boxes (CAD frame, mm): overall
 * width (x span), depth (y span) and the widest parts, as fractions of total height H, so the
 * agent can check its proportion table with numbers instead of by eye.
 */
function profileText(scene, ids) {
  const parts = (scene.parts || []).filter(
    (p) => p.bounds && !p.hidden && p.role !== 'reference' && p.role !== 'cutout' && !p.referenceImage && (!ids?.length || ids.includes(p.id))
  );
  if (!parts.length) return '';
  const zMin = Math.min(...parts.map((p) => p.bounds.min[2]));
  const zMax = Math.max(...parts.map((p) => p.bounds.max[2]));
  const H = zMax - zMin;
  if (H <= 0) return '';
  const f = (v) => (v / H).toFixed(2);
  const rows = [];
  for (let k = 9; k >= 0; k--) {
    const z0 = zMin + (k * H) / 10, z1 = zMin + ((k + 1) * H) / 10;
    const inBand = parts.filter((p) => p.bounds.max[2] > z0 && p.bounds.min[2] < z1);
    if (!inBand.length) {
      rows.push(`${f(z0 - zMin)}–${f(z1 - zMin)} H: empty`);
      continue;
    }
    const x0 = Math.min(...inBand.map((p) => p.bounds.min[0])), x1 = Math.max(...inBand.map((p) => p.bounds.max[0]));
    const y0 = Math.min(...inBand.map((p) => p.bounds.min[1])), y1 = Math.max(...inBand.map((p) => p.bounds.max[1]));
    const wx = (p) => p.bounds.max[0] - p.bounds.min[0];
    const widest = [...inBand].sort((a, b) => wx(b) - wx(a)).slice(0, 3);
    rows.push(
      `${f(z0 - zMin)}–${f(z1 - zMin)} H: width ${f(x1 - x0)} H (${Math.round(x1 - x0)} mm), depth ${f(y1 - y0)} H · ${widest.map((p) => `${p.id} ${f(wx(p))}`).join(', ')}`
    );
  }
  return [
    `Model profile from part bounding boxes (H = ${Math.round(H)} mm; widths are x spans, so rotated parts read a little wide), top to bottom:`,
    ...rows,
    'Measure the same bands in the reference (as fractions of its height) and fix any band whose width or depth is off by more than ~10%.',
  ].join('\n');
}

server.registerTool(
  'find_parts',
  {
    title: 'Find parts',
    description:
      "Searches the studio's catalog of real, purchasable parts with exact CAD geometry: servos (Feetech, Dynamixel…), motors, robot hands and grippers, computers (Raspberry Pi, Jetson…), microcontrollers, drivers, sensors, LiDAR, depth cameras and cameras, plus ISO screws, nuts, washers, heat-set inserts, standoffs, dowel pins and bearings. " +
      'Returns catalog keys with exact sizes, key specs and mounting details (hole patterns, horn and bracket interfaces). Place them with add_parts({ catalog }) and design your brackets and pockets around their real dimensions. ' +
      'Pass a few words to filter (e.g. "servo", "depth camera", "raspberry"), or nothing to list everything.',
    inputSchema: { query: z.string().max(80).optional() },
  },
  async ({ query }) => {
    try {
      const res = await bridge('catalog', { query: query ?? '' });
      return text(res?.text || 'The catalog is empty.');
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'compare',
  {
    title: 'Compare with reference',
    description:
      'Shows a reference image (ref-N from the chat, an evidence path, or an image URL) next to renders of your model from the matching viewpoint, so you can check shapes and proportions against the real thing. ' +
      'Pick views that match the photo: front/side/back/top for straight-on shots and drawings, or "az:<deg>,el:<deg>" for angled photos (az 0 = front, +90 = the robot\'s left side, −90 its right; el = degrees above horizontal). ' +
      'Use it after the block-out, after each subassembly and before you finish. Pass ids to compare one subassembly with a close-up photo.',
    inputSchema: {
      reference: z.string().describe('ref-N, an evidence path, or an image URL'),
      views: z.array(VIEW).min(1).max(3).default(['front']),
      ids: z.array(z.string()).optional().describe('Only render these parts (for close-up photos)'),
    },
  },
  async ({ reference, views, ids }) => {
    try {
      let refUrl = await loadReference(reference);
      try {
        const small = await bridge('downscale_image', { dataUrl: refUrl, maxSide: 1024 }, 20000);
        if (small?.dataUrl) refUrl = small.dataUrl;
      } catch {
        /* send the original */
      }
      const [shots, scene] = await Promise.all([bridge('screenshot', { views, ids }, 60000), bridge('snapshot', {}).catch(() => null)]);
      const content = [{ type: 'text', text: `Reference ${reference}:` }];
      const push = (dataUrl) => {
        const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(dataUrl || '');
        if (m) content.push({ type: 'image', mimeType: m[1], data: m[2] });
      };
      push(refUrl);
      for (const shot of shots.images || []) {
        content.push({ type: 'text', text: `Your model, ${shot.view}${ids?.length ? ` (${ids.join(', ')})` : ''}:` });
        push(shot.dataUrl);
      }
      const profile = scene ? profileText(scene, ids) : '';
      if (profile) content.push({ type: 'text', text: profile });
      // Straight-on photo with a plain background: measure both silhouettes band by band
      const straight = views.find((v) => ['front', 'back', 'side'].includes(v));
      if (straight) {
        try {
          const sc = await bridge('silhouette_compare', { reference: refUrl, view: straight, ids }, 60000);
          if (sc?.plain && sc.reference && sc.model) {
            const rows = sc.reference.bands.map((r, i) => {
              const m = sc.model.bands[i] ?? 0;
              const ratio = r > 0.005 ? m / r : 0;
              const flag = r > 0.005 && (ratio < 0.85 || ratio > 1.15) ? (ratio < 1 ? '  ← model too narrow' : '  ← model too wide') : '';
              return `${i * 10}–${(i + 1) * 10}% from top: photo ${r.toFixed(2)}, model ${m.toFixed(2)}${r > 0.005 ? ` (×${ratio.toFixed(2)})` : ''}${flag}`;
            });
            content.push({
              type: 'text',
              text: [
                `Measured silhouettes, ${straight} view vs ${reference} (only meaningful if that photo is straight-on from the ${straight}; perspective photos distort widths 5–10%, so bands are flagged beyond ±15%; width of each tenth of the height, as a fraction of the height):`,
                ...rows,
                `Overall width/height: photo ${sc.reference.aspect.toFixed(2)}, model ${sc.model.aspect.toFixed(2)}.`,
              ].join('\n'),
            });
          } else if (sc && !sc.plain) {
            content.push({ type: 'text', text: `(No measured silhouette for ${reference}: ${sc.reason ?? 'background not plain'}.)` });
          }
        } catch {
          /* measuring is optional */
        }
      }
      content.push({
        type: 'text',
        text: [
          'Compare them subassembly by subassembly, top to bottom:',
          '1. Silhouette: where does each subassembly start and end, as a fraction of total height? How wide is each one relative to the height and to its neighbours (e.g. base vs column, head vs torso)?',
          '2. Shape: each shell\'s profile (taper, roundness, flat vs domed, corner radii), the visible seams and splits, and which part each feature belongs to (a camera on a cap brim belongs to the cap).',
          '3. Missing or extra features.',
          'Shadows, reflections, highlights and colour changes are not geometry unless you can see an edge, gap or step. If the photo is at an angle you didn\'t match, call compare again with a closer az/el.',
          'Write the 3 biggest differences, then fix them before moving on.',
        ].join('\n'),
      });
      return { content };
    } catch (err) {
      return fail(err);
    }
  }
);

function gap(a, b) {
  let g = -Infinity;
  for (let i = 0; i < 3; i++) g = Math.max(g, a.min[i] - b.max[i], b.min[i] - a.max[i]);
  return g;
}


if (!NO_WEB) server.registerTool(
  'robot_skeleton',
  {
    title: 'Read robot description',
    description:
      "Reads a published robot description (URDF or MuJoCo MJCF XML, e.g. a raw.githubusercontent.com link; GitHub blob links work too) and returns the exact zero-pose skeleton in the studio frame: every joint's position (mm), axis, range and offset from its parent joint. Use it whenever an open-source robot publishes one; build the joint chain to these numbers instead of estimating. Meshes are not read: part shapes still come from the photos.",
    inputSchema: {
      url: z.string().describe('URL of the .urdf or MJCF .xml file'),
      forward: z.enum(['+x', '-x', '+y', '-y']).optional().describe('Source axis the robot faces (default +x, the ROS convention)'),
    },
  },
  async ({ url, forward }) => {
    try {
      return text(describeSkeleton(await fetchSkeleton(url, forward)));
    } catch (err) {
      return fail(err);
    }
  }
);

if (!NO_WEB) server.registerTool(
  'find_robot_description',
  {
    title: 'Find robot description',
    description:
      'Searches GitHub for a named robot\'s published description files (URDF, MJCF/MuJoCo XML, xacro) and returns raw URLs ready for robot_skeleton, best matches first. Call it first for any named or open-source robot: exact link lengths beat any estimate.',
    inputSchema: { name: z.string().min(2).max(80).describe('Robot name, e.g. "Berkeley Humanoid", "Reachy Mini"') },
  },
  async ({ name }) => {
    try {
      const gh = async (url) => {
        const res = await fetchWithTimeout(url, 20000, { headers: { Accept: 'application/vnd.github+json' } });
        if (!res.ok) throw new Error(`GitHub returned ${res.status}${res.status === 403 ? ' (rate limit; try again in a minute or use WebSearch)' : ''}`);
        return res.json();
      };
      const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const repos = [];
      // Few calls: GitHub allows 60 unauthenticated requests an hour
      for (const q of [`${name} urdf`, name]) {
        const found = await gh(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=5`);
        for (const r of found.items ?? []) if (!repos.some((x) => x.full_name === r.full_name)) repos.push(r);
        if (repos.length >= 4) break;
      }
      // Exact-name matches first: every query word counts, and each extra word that names a
      // variant (lite, mini, v2, gazebo…) counts against, so "Berkeley Humanoid" doesn't pick the Lite
      const tokens = (t) => String(t).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const nameScore = (r) => {
        const toks = tokens(r.name);
        const hit = words.filter((w) => toks.includes(w) || r.name.toLowerCase().includes(w)).length;
        const extra = toks.filter((t) => !words.includes(t) && !['description', 'urdf', 'model', 'robot', 'ros', 'mjcf', 'assets'].includes(t)).length;
        return hit * 2 - extra;
      };
      repos.sort((a, b) => nameScore(b) - nameScore(a) || b.stargazers_count - a.stargazers_count);
      const lines = [];
      let withFiles = 0;
      for (const repo of repos.slice(0, 4)) {
        if (withFiles >= 3) break;
        let tree;
        try {
          tree = await gh(`https://api.github.com/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`);
        } catch {
          continue;
        }
        const files = (tree.tree ?? [])
          .map((t) => t.path)
          .filter((p) => /\.(urdf|xacro)$/i.test(p) || (/\.xml$/i.test(p) && /(mjcf|mujoco|robot|scene|model)/i.test(p)))
          .filter((p) => !/(test|example|gazebo|collision|_backup)/i.test(p));
        if (!files.length) continue;
        withFiles++;
        const score = (p) => words.filter((w) => p.toLowerCase().includes(w)).length * 2 + (/\.urdf$/i.test(p) ? 1 : 0) - p.split('/').length * 0.05;
        files.sort((x, y) => score(y) - score(x));
        lines.push(`${repo.full_name} (★${repo.stargazers_count}): ${repo.description ?? ''}`.slice(0, 200));
        for (const f of files.slice(0, 6)) lines.push(`  https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/${f}`);
      }
      return text(lines.length ? lines.join('\n') : `No URDF/MJCF files found for "${name}". Try another name or WebSearch for the project.`);
    } catch (err) {
      return fail(err);
    }
  }
);

if (!NO_WEB) server.registerTool(
  'check_skeleton',
  {
    title: 'Check against robot description',
    description:
      "Checks the model against a published robot description (same URL as robot_skeleton): every moving joint must sit inside some part of the model, at the zero pose. Reports joints that fall outside the model (with the nearest part and how far), and how the model's overall extents compare with the joint layout. Run it after the block-out and before you finish on any robot that publishes a URDF/MJCF.",
    inputSchema: {
      url: z.string(),
      forward: z.enum(['+x', '-x', '+y', '-y']).optional(),
      floorOffset: z.number().optional().describe('Height of the lowest joint above the floor in your model, mm (default: the model\'s own lowest joint guess, i.e. soles below it)'),
    },
  },
  async ({ url, forward, floorOffset }) => {
    try {
      const sk = await fetchSkeleton(url, forward);
      const scene = await bridge('snapshot', {});
      const parts = (scene.parts || []).filter((p) => p.bounds && !p.hidden && p.role === 'solid' && !p.referenceImage);
      if (!parts.length) return text('The model has no solid parts yet.');
      return text(checkAgainstSkeleton(sk, parts, floorOffset));
    } catch (err) {
      return fail(err);
    }
  }
);

/* ------------------------------------------------------------------ */
/* Evidence: attached folders and images found on the web              */
/* ------------------------------------------------------------------ */

function evidencePath(p) {
  if (!EVIDENCE_DIR) throw new Error('No evidence folder is set up.');
  const full = path.resolve(EVIDENCE_DIR, String(p).replace(/^\/+/, ''));
  if (!full.startsWith(EVIDENCE_DIR + path.sep)) throw new Error(`"${p}" is outside the evidence folder.`);
  return full;
}

server.registerTool(
  'list_evidence',
  {
    title: 'List evidence',
    description:
      'Lists every file the user attached as evidence (photos, notes, URDFs, specs, mesh summaries), grouped by folder, newest folder first. Paths are what read_evidence takes.',
    inputSchema: { folder: z.string().optional().describe('Only this folder id') },
  },
  async ({ folder }) => {
    try {
      if (!EVIDENCE_DIR || !fs.existsSync(EVIDENCE_DIR)) return text('No evidence attached.');
      const folders = fs
        .readdirSync(EVIDENCE_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory() && (!folder || d.name === folder))
        .map((d) => ({ id: d.name, mtime: fs.statSync(path.join(EVIDENCE_DIR, d.name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      const lines = [];
      let count = 0;
      for (const f of folders) {
        let name = f.id;
        try {
          name = JSON.parse(fs.readFileSync(path.join(EVIDENCE_DIR, f.id, '.folder.json'), 'utf-8')).name || f.id;
        } catch {
          /* no metadata */
        }
        lines.push(`${name} (${f.id}):`);
        const walk = (dir) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith('.') || count >= 1000) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else {
              count++;
              lines.push(`- ${path.relative(EVIDENCE_DIR, full).split(path.sep).join('/')} (${Math.max(1, Math.round(fs.statSync(full).size / 1024))} KB)`);
            }
          }
        };
        walk(path.join(EVIDENCE_DIR, f.id));
      }
      return text(lines.length ? lines.join('\n') : 'No evidence attached.');
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'read_evidence',
  {
    title: 'Read evidence',
    description:
      'Opens files the user attached as evidence. Images come back as images to study; text files (notes, specs, URDF/MJCF, BOMs, code) and .mesh.txt summaries (exact bounding box and volume of an attached STL) come back as text. ' +
      'Read every attached file before planning; pass several image paths at once to compare views.',
    inputSchema: {
      paths: z.array(z.string()).min(1).max(8).describe('Paths from the evidence listing, e.g. "ev-abc/photos/front.jpg"'),
      offset: z.number().int().min(0).optional().describe('Character offset for long text files'),
    },
  },
  async ({ paths, offset = 0 }) => {
    const content = [];
    for (const p of paths) {
      try {
        const full = evidencePath(p);
        if (!fs.existsSync(full)) {
          content.push({ type: 'text', text: `${p}: not found. Call list_evidence for the exact paths.` });
          continue;
        }
        const mime = IMAGE_EXT[path.extname(full).toLowerCase()];
        if (mime) {
          content.push({ type: 'text', text: p });
          content.push({ type: 'image', mimeType: mime, data: fs.readFileSync(full).toString('base64') });
        } else {
          const body = fs.readFileSync(full, 'utf-8');
          const chunk = body.slice(offset, offset + 30000);
          const more = offset + chunk.length < body.length ? `\n[…${body.length - offset - chunk.length} more characters: read again with offset ${offset + chunk.length}]` : '';
          content.push({ type: 'text', text: `${p}:\n${chunk}${more}` });
        }
      } catch (err) {
        content.push({ type: 'text', text: `${p}: ${String(err?.message ?? err)}` });
      }
    }
    return { content };
  }
);

async function fetchWithTimeout(url, ms, init = {}) {
  const { protocol, hostname } = new URL(url);
  // Public web only: the app bridge and the local network stay out of reach
  if (!/^https?:$/.test(protocol) || /^(localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(hostname)) {
    throw new Error('only public http(s) addresses are allowed');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) Basecase/1.0', ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

if (!NO_WEB) server.registerTool(
  'find_images',
  {
    title: 'Find images on a page',
    description:
      'Lists the images on a web page (README, product page, docs, blog, forum post): absolute URLs with their alt text, largest first when sizes are known. ' +
      'Use it to find photos from other angles, exploded views and dimensioned drawings, then open them with view_image. WebFetch drops image links; this keeps them.',
    inputSchema: { url: z.string().url() },
  },
  async ({ url }) => {
    try {
      const res = await fetchWithTimeout(url, 20000);
      if (!res.ok) return fail(`The page returned ${res.status}.`);
      const html = (await res.text()).slice(0, 3_000_000);
      const base = res.url || url;
      const found = new Map();
      const add = (src, alt = '', size = 0) => {
        if (!src || src.startsWith('data:')) return;
        let abs;
        try {
          abs = new URL(src.replace(/&amp;/g, '&'), base).href;
        } catch {
          return;
        }
        if (/\.(svg|ico)(\?|$)/i.test(abs) || /badge|shields\.io|favicon|logo|avatar|emoji|sprite|pixel|tracking/i.test(abs)) return;
        const prev = found.get(abs);
        if (!prev || (!prev.alt && alt) || size > prev.size) found.set(abs, { alt: alt || prev?.alt || '', size: Math.max(size, prev?.size ?? 0) });
      };
      for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi)) {
        add(/content=["']([^"']+)["']/i.exec(m[0])?.[1], 'page preview');
      }
      for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
        const tag = m[0];
        const attr = (n) => new RegExp(`\\b${n}=["']([^"']*)["']`, 'i').exec(tag)?.[1];
        const w = Number(attr('width')) || 0;
        const h = Number(attr('height')) || 0;
        if ((w && w < 64) || (h && h < 64)) continue;
        const srcset = attr('srcset') || attr('data-srcset');
        const best = srcset?.split(',').map((s) => s.trim().split(/\s+/)[0]).pop();
        add(attr('data-canonical-src') || best || attr('data-src') || attr('src'), attr('alt'), w * h);
      }
      for (const m of html.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)) add(m[2], m[1]);
      for (const m of html.matchAll(/https?:\/\/[^\s"'<>()]+\.(?:png|jpe?g|webp)(?:\?[^\s"'<>()]*)?/gi)) add(m[0]);
      const list = [...found.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 80);
      if (!list.length) return text('No images found on that page.');
      return text(list.map(([u, i]) => `- ${u}${i.alt ? ` — ${i.alt.slice(0, 120)}` : ''}`).join('\n'));
    } catch (err) {
      return fail(err);
    }
  }
);

if (!NO_WEB) server.registerTool(
  'view_image',
  {
    title: 'View image',
    description:
      'Downloads an image from the web (PNG, JPEG, WebP or GIF) and returns it so you can study it: product photos from other angles, renders, exploded views, dimensioned drawings, datasheet figures. ' +
      'Find URLs with find_images or WebSearch. Up to 4 per call.',
    inputSchema: { urls: z.array(z.string().url()).min(1).max(4) },
  },
  async ({ urls }) => {
    const content = [];
    for (const url of urls) {
      try {
        const res = await fetchWithTimeout(url, 25000);
        if (!res.ok) throw new Error(`returned ${res.status}`);
        const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const mime = /^image\/(png|jpeg|webp|gif)$/.test(type) ? type : IMAGE_EXT[path.extname(new URL(url).pathname).toLowerCase()];
        if (!mime) throw new Error(`is ${type || 'not an image'}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 20_000_000) throw new Error('is larger than 20 MB');
        let dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        // The app downscales to Claude's 1568 px vision size; fall back to the original
        try {
          const small = await bridge('downscale_image', { dataUrl, maxSide: 1568 }, 20000);
          if (small?.dataUrl) dataUrl = small.dataUrl;
        } catch {
          if (buf.length > 4_500_000) throw new Error('is too large to view');
        }
        const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(dataUrl);
        content.push({ type: 'text', text: url });
        content.push({ type: 'image', mimeType: m[1], data: m[2] });
      } catch (err) {
        content.push({ type: 'text', text: `${url}: couldn't open it (${String(err?.message ?? err)}).` });
      }
    }
    return { content };
  }
);

server.registerTool(
  'check_scene',
  {
    title: 'Check model',
    description:
      'Model checks: parts that pass THROUGH each other (mesh-level interference with depth; parts may touch but never interpenetrate, so an inserted servo or screw needs its pocket or hole cut), solid parts still left as block-out primitives, floating parts, parts below the floor (z < 0), and missing left/right twins. Run it after each subassembly and before you finish; fix every interference and primitive.',
    inputSchema: {},
  },
  async () => {
    try {
      const scene = await bridge('snapshot', {});
      const solids = (scene.parts || []).filter((p) => p.role !== 'reference' && !p.referenceImage && !p.hidden && p.bounds);
      const boxes = solids.map((p) => ({ p, b: p.bounds }));
      const issues = [];
      for (const { p, b } of boxes) {
        if (b.min[2] < -0.5) issues.push(`${p.id}: ${Math.abs(b.min[2]).toFixed(1)} mm below the floor`);
        const onFloor = Math.abs(b.min[2]) <= 1;
        const touching = boxes.some((o) => o.p !== p && gap(b, o.b) <= 1);
        if (!onFloor && !touching && p.role !== 'cutout') issues.push(`${p.id}: floating (touches nothing)`);
      }
      try {
        const { items = [], coplanar = [] } = (await bridge('interference', {}, 120000)) ?? {};
        for (const c of coplanar.slice(0, 20)) {
          issues.push(`${c.a} / ${c.b}: ${c.areaMm2} mm² of flush same-facing surface (renders as flicker). Set the panel, decal or cover 0.2–0.5 mm proud or inset, or cut a recess for it.`);
        }
        for (const it of items.slice(0, 30)) {
          issues.push(`${it.a} ↔ ${it.b}: pass through each other, up to ${it.depthMm} mm deep (${Math.round(it.fraction * 100)}% of the smaller part inside). Cut a pocket or hole, move one, or resize.`);
        }
        if (items.length > 30) issues.push(`…and ${items.length - 30} more interferences`);
      } catch (err) {
        issues.push(`(interference check unavailable: ${String(err?.message ?? err)})`);
      }
      const finished = new Set(['cad_part', 'component', 'hardware', 'image_plane', 'mesh']);
      const primitives = solids.filter((p) => p.role === 'solid' && p.kind && !finished.has(p.kind) && !String(p.kind).startsWith('cad'));
      if (primitives.length) {
        issues.push(`${primitives.length} solid parts are still block-out primitives (replace each with model_part or a catalog part): ${primitives.slice(0, 20).map((p) => p.id).join(', ')}${primitives.length > 20 ? '…' : ''}`);
      }
      const byId = new Map(solids.map((p) => [p.id, p]));
      for (const p of solids) {
        if (!/(^|-)left(-|$)/.test(p.id)) continue;
        const twin = byId.get(p.id.replace(/(^|-)left(-|$)/, '$1right$2'));
        if (!twin) issues.push(`${p.id}: no right-side twin`);
      }
      const b = scene.bounds;
      const head = `${solids.length} parts${b ? `, overall ${b.size.map((v) => Math.round(v)).join(' × ')} mm (x × y × z)` : ''}.`;
      return text(issues.length ? `${head}\nIssues:\n- ${issues.slice(0, 40).join('\n- ')}` : `${head}\nNo issues found.`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'define_joints',
  {
    title: 'Declare joints',
    description:
      'Declares the robot\'s joints so the app can check them: which parts sit on each side, which servo drives it, and its range. ' +
      'parent = parts the joint is mounted on (toward the torso); child = the parts of the next link that turn with it (the app adds everything further out through the other joints). ' +
      'With actuators, the pivot and axis come from the servo\'s real output spline, so omit origin and axis unless the joint is not on a servo output (a linkage, an idler-only joint). ' +
      'limb sets the load case: leg joints are also checked standing on that leg. Merged by id unless replace is true.',
    inputSchema: {
      joints: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9_-]+$/),
            name: z.string().max(60).optional().describe('e.g. "Left Knee Pitch"'),
            type: z.enum(['revolute', 'prismatic', 'fixed']).optional().describe('revolute (default) turns about the axis; prismatic slides along it (a lift, a linear actuator)'),
            parent: z.array(z.string()).min(1).max(40),
            child: z.array(z.string()).min(1).max(80),
            parent_joint: z.string().optional().describe('The joint this one is mounted on, when several joints share one link (a 2-DOF wrist: the second joint sits on the first)'),
            actuators: z.array(z.string()).max(2).optional().describe('Servo part ids; two opposed servos share the load'),
            origin: vec3.optional().describe('A point on the axis, mm, z up (omit to use the servo output)'),
            axis: vec3.optional().describe('Axis direction (omit to use the servo output axis)'),
            range: z.tuple([z.number().min(-2000).max(0), z.number().min(0).max(2000)]).optional().describe('From the modeled pose: degrees, e.g. [-30, 120] (mm for prismatic). Posing and animations are held inside it.'),
            limb: z.enum(['leg', 'arm', 'neck', 'torso', 'other']).optional(),
          })
        )
        .min(1)
        .max(40),
      replace: z.boolean().optional(),
    },
  },
  async ({ joints, replace }) => {
    try {
      const res = await bridge('define_joints', { joints, replace });
      return text(res?.text || 'ok');
    } catch (err) {
      return fail(err);
    }
  }
);

const ROOT = z
  .object({
    position: vec3.optional().describe('Whole-robot offset from the modeled pose, mm (e.g. [0, 0, -40] crouches the body 40 mm)'),
    rotation: vec3.optional().describe('Whole-robot turn, XYZ degrees about the hips'),
  })
  .optional();
const IK_GOAL = z.object({
  part: z.string().describe('Part id, or a joint id (its link): e.g. the ankle joint for a foot, the wrist joint for a hand'),
  target: vec3.optional().describe('Where that point goes, mm (agent frame)'),
  move: vec3.optional().describe('Or how far to move it from where it is now, mm'),
  where: z.enum(['bottom', 'center']).optional().describe('The point on the part: bottom = the sole of a foot; center (default) for hands and heads'),
  keep_orientation: z.boolean().optional().describe('Also keep the part turned as in the modeled pose (feet flat on the floor)'),
});
const PREVIEW = z
  .object({ frames: z.number().int().min(2).max(8).optional(), view: VIEW.optional() })
  .optional()
  .describe('Render evenly spaced frames to check the motion (side view shows gaits best)');

/** Text plus any images from a posing reply */
function withImages(res) {
  const content = [{ type: 'text', text: res?.text || 'ok' }];
  for (const shot of res?.images || []) {
    content.push({ type: 'text', text: shot.view });
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(shot.dataUrl || '');
    if (m) content.push({ type: 'image', mimeType: m[1], data: m[2] });
  }
  return { content };
}

server.registerTool(
  'get_rig',
  {
    title: 'Joints and poses',
    description:
      'Lists the robot\'s joints (id, type, axis, pivot, range, the joint it is mounted on, the parts it moves), the pose on the canvas, saved poses, animations, the feet a gait would use and the mocap landmarks. ' +
      'Call it before posing or animating, and after import_robot.',
    inputSchema: {},
  },
  async () => {
    try {
      return text((await bridge('get_rig', {}))?.text || 'No joints.');
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'pose',
  {
    title: 'Pose',
    description:
      'Poses the robot on the canvas: set joint values (degrees, or mm for prismatic joints, from the modeled pose; held inside each joint\'s range), and/or reach with IK (a hand to a point, a foot onto a step), and/or move the whole body. ' +
      'Starts from the current pose unless from_rest. Never edits the parts: the modeled pose stays the design. Reports values held at a limit, IK misses, new collisions between links and the floor. ' +
      'save_as keeps it as a named pose; apply restores a saved one. Pass views to see the result. Use it when the user asks for a pose ("wave", "crouch", "T-pose"), and to check a design can reach what it needs to.',
    inputSchema: {
      values: z.record(z.string(), z.number()).optional().describe('Joint id → value'),
      relative: z.boolean().optional().describe('Add values to the current ones'),
      from_rest: z.boolean().optional().describe('Start from the modeled pose'),
      root: ROOT,
      ik: z.array(IK_GOAL).max(6).optional().describe('Reach goals solved together; joints given in values stay fixed'),
      apply: z.string().optional().describe('Name of a saved pose to start from'),
      save_as: z.string().max(40).optional(),
      views: z.array(VIEW).max(3).optional(),
    },
  },
  async (args) => {
    try {
      return withImages(await bridge('pose', args, 120000));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'animate',
  {
    title: 'Animate',
    description:
      'Makes a named animation and plays it. Either keyframes (t in seconds; joint values, a body offset, and/or IK goals per keyframe; joints not given hold their previous value) for gestures like a wave or a nod, ' +
      'or a gait: a walk cycle solved with IK so the feet stay planted while on the ground and lift while swinging, for any number of legs (2: walk; 4: trot, feet front-left, front-right, rear-left, rear-right). ' +
      'Gait defaults come from the leg length; tune stride, lift, period, crouch (bend the knees so they can reach), bob and sway, and add oscillators for arm swing or a head bob. ' +
      'Same name replaces. Reports IK misses, joints at their limits, collisions and floor contact at 8 sampled times; preview renders frames.',
    inputSchema: {
      name: z.string().min(1).max(40),
      duration: z.number().min(0.1).max(600).optional().describe('Seconds (a gait: one cycle)'),
      loop: z.boolean().optional(),
      interpolation: z.enum(['smooth', 'linear']).optional(),
      keyframes: z
        .array(
          z.object({
            t: z.number().min(0),
            values: z.record(z.string(), z.number()).optional(),
            root: ROOT,
            ik: z.array(IK_GOAL.extend({ target: vec3 })).max(6).optional(),
          })
        )
        .max(120)
        .optional(),
      gait: z
        .object({
          feet: z.array(z.string()).max(8).optional().describe('Ankle joints or foot parts; found automatically when left out'),
          phases: z.array(z.number().min(0).max(1)).max(8).optional().describe('When each foot lifts, as a fraction of the cycle'),
          stride: z.number().min(0).max(2000).optional().describe('Step length, mm'),
          lift: z.number().min(0).max(500).optional().describe('Foot lift, mm'),
          period: z.number().min(0.2).max(10).optional().describe('Seconds per cycle'),
          duty: z.number().min(0.3).max(0.9).optional().describe('Share of the cycle each foot is down (walk ~0.6, trot ~0.5)'),
          crouch: z.number().min(0).max(500).optional().describe('Lower the body, mm'),
          bob: z.number().min(0).max(200).optional(),
          sway: z.number().min(0).max(200).optional(),
          heading: z.number().min(-180).max(180).optional().describe('Degrees from straight ahead'),
          oscillators: z
            .array(z.object({ joint: z.string(), amplitude: z.number(), phase: z.number().optional().describe('Degrees of the cycle'), offset: z.number().optional() }))
            .max(20)
            .optional(),
        })
        .optional(),
      play: z.boolean().optional(),
      preview: PREVIEW,
    },
  },
  async (args) => {
    try {
      return withImages(await bridge('animate', args, 180000));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'retarget_motion',
  {
    title: 'Retarget motion capture',
    description:
      'Turns a BVH motion-capture file (an attached evidence file, or a URL) into an animation on the robot. Each robot limb is pointed the way the performer\'s limb points (so different proportions and rest poses work), the body follows the hips scaled by leg length, and feet are kept on the floor. ' +
      'Bones and joints are matched by name automatically; override with bones / joints (landmark → BVH bone or robot joint id; landmarks: hips, chest, head, leftShoulder, leftElbow, leftWrist, leftHip, leftKnee, leftAnkle, leftToe and the right ones). ' +
      'Reports the match and the mean miss per landmark; preview renders frames.',
    inputSchema: {
      file: z.string().optional().describe('Evidence path of a .bvh file'),
      url: z.string().url().optional().describe('Or a link to one'),
      name: z.string().max(40).optional(),
      start: z.number().min(0).optional().describe('Seconds into the clip'),
      end: z.number().min(0).optional(),
      fps: z.number().min(5).max(60).optional(),
      in_place: z.boolean().optional().describe('Keep the robot over its spot (no travel)'),
      loop: z.boolean().optional(),
      bones: z.record(z.string(), z.string()).optional(),
      joints: z.record(z.string(), z.string()).optional(),
      play: z.boolean().optional(),
      preview: PREVIEW,
    },
  },
  async ({ file, ...rest }) => {
    try {
      let textBody;
      if (file) {
        const full = evidencePath(file);
        if (!fs.existsSync(full)) return text(`${file}: not found. Call list_evidence for the exact paths.`);
        textBody = fs.readFileSync(full, 'utf-8');
      }
      if (!textBody && !rest.url) return text('Give file (an attached .bvh) or url.');
      return withImages(await bridge('retarget', { ...rest, file, text: textBody }, 300000));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'import_robot',
  {
    title: 'Import a published robot',
    description:
      'Inserts a published robot from its URDF or MuJoCo MJCF with its meshes: every link becomes a part, every joint becomes a posable joint with its real axis and limits. ' +
      'Presets: unitree-g1 (29 joints), unitree-h1, unitree-go2 (quadruped), berkeley-humanoid, open-duck-mini, so101 (arm). Or a raw/GitHub URL to a .urdf or .xml. ' +
      'Use it when the user wants an existing robot to pose or animate, or as a reference beside a design.',
    inputSchema: {
      preset: z.enum(['unitree-g1', 'unitree-h1', 'unitree-go2', 'berkeley-humanoid', 'open-duck-mini', 'so101']).optional(),
      url: z.string().url().optional(),
      name: z.string().max(40).optional(),
    },
  },
  async (args) => {
    try {
      return text((await bridge('import_robot', args, 300000))?.text || 'ok');
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'verify_design',
  {
    title: 'Verify design',
    description:
      'Engineering checks computed from the model (not opinions), each PASS, WARN, FAIL or NOT RUN with the measured number: mass and centre of mass; static torque of every declared joint against its servo (worst of holding the limb out across the range and, for legs, standing on that leg; PASS ≤ 1/5 of stall, WARN ≤ rated); servo output on the joint axis; a support bearing opposite each servo; every joint swept through its range for collisions; battery voltage against each servo\'s input range; current and runtime; standing stability; PLA touching servos. ' +
      'Run it after define_joints and again before you finish. A design is not buildable while anything FAILs; fix and re-run.',
    inputSchema: {},
  },
  async () => {
    try {
      const res = await bridge('verify', {}, 300000);
      return text(res?.text || 'Nothing to check yet.');
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'get_bom',
  {
    title: 'Bill of materials',
    description:
      'The build\'s bill of materials, computed from the scene: catalog components and exact hardware counted by part, printed parts as filament grams, plus purchase-only extras (set_build). Each line has its catalog key and the price the user recorded from a listing, with the date, or "no price recorded". ' +
      'Totals are compared with the user\'s budget. Use it to keep the design inside the budget (fewer or cheaper actuators, one screw size), and report it at the end. Never state a price that is not in this output.',
    inputSchema: {},
  },
  async () => {
    try {
      const res = await bridge('bom', {}, 60000);
      return text(res?.text || 'Nothing to buy yet.');
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'check_printability',
  {
    title: 'Check printability',
    description:
      'Checks every printed part (or ids) for a Bambu Lab P1S (256 × 256 × 250 mm, 18 × 28 mm keep-out at the front left): best flat orientation, bed fit, overhangs past 45° and the support they need, walls thinner than two 0.42 mm lines, filament grams, print time and plates. ' +
      'Fix every part it flags: split anything that does not fit (with dowels, a lap joint or screws across the split), give large overhangs 45° chamfers or a flat face to print on, thicken thin walls. Estimates without a slicer.',
    inputSchema: { ids: z.array(z.string()).max(200).optional() },
  },
  async ({ ids }) => {
    try {
      const res = await bridge('printability', { ids }, 180000);
      return text(res?.text || 'No printed parts yet.');
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'set_build',
  {
    title: 'Build settings',
    description:
      'Adds things to buy that are not modeled parts (battery, charger, buck converter, power switch, cables, microSD) to the BOM, by catalog key: "supply:<id>" from find_parts, or "component:<id>" for a catalog part that isn\'t placed. ' +
      'Merged by key; qty 0 removes one. Also sets the budget (only when the user gives one) and the default print material.',
    inputSchema: {
      extras: z
        .array(z.object({ key: z.string(), qty: z.number().int().min(0).max(500), note: z.string().max(120).optional().describe('Why it is needed, e.g. "powers the servo bus"') }))
        .max(40)
        .optional(),
      budget_usd: z.number().min(0).max(100000).optional(),
      material: z.enum(['PLA', 'PETG', 'ABS', 'ASA']).optional(),
    },
  },
  async ({ extras, budget_usd, material }) => {
    try {
      const res = await bridge('set_build', { extras, budgetUsd: budget_usd, material });
      const unknown = res?.unknown?.length ? ` Unknown keys (not added): ${res.unknown.join(', ')}. Use keys from find_parts.` : '';
      return text(`Extras: ${(res?.extras ?? []).map((x) => `${x.qty}× ${x.key}`).join(', ') || 'none'}.${unknown}`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  'set_status',
  {
    title: 'Status',
    description: 'Shows a short status line in the app, e.g. "Designing the coxa bracket". Under 6 words. Call when you change stage or part.',
    inputSchema: { status: z.string().min(1).max(60) },
  },
  async ({ status }) => {
    try {
      await bridge('status', { status }, 10000);
      return text('ok');
    } catch (err) {
      return fail(err);
    }
  }
);

await server.connect(new StdioServerTransport());
warmUp();
