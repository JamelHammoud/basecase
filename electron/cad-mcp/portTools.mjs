import { z } from 'zod';
import { renderPart } from '../cad-kernel/client.mjs';
import { settledWrites, trackWrite } from './pendingWrites.mjs';
import { idSchema, vec3 } from './schemas.mjs';
import { bridge, clashText, fail, text } from './shared.mjs';

export const getPorts = {
  name: 'get_ports',
  config: {
    title: 'Read ports',
    description:
      'Lists the mounting ports of parts, in the world frame (mm, Z up): servo outputs and horn hole circles, case screw holes, board mounting holes, camera mounts and lenses, screw seats and tips, insert and nut faces, and the ports a CAD part declares. ' +
      'Each port has a name, kind (output, boss, face, bore, screw, hole_circle), position, an axis pointing out of the part, and thread, diameter and depth where they apply. ' +
      'Use the names with mate and fasten ("<part id>:<port name>").',
    inputSchema: { ids: z.array(z.string()).min(1).max(20) },
  },
  handler: async ({ ids }) => {
    try {
      return text((await bridge('ports', { ids }))?.text || 'No ports.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const mate = {
  name: 'mate',
  config: {
    title: 'Mate parts',
    description:
      'Places a part by its port against a port of a fixed target, in one step (like build123d connect_to). Nothing is solved later: it moves the part once and records the mate. ' +
      'Types: fastened, face, coaxial and slider put the two port axes facing each other (horn face against bracket face, shaft tip into a bore); press_fit points them the same way (a bearing or insert flush in its bore). flip reverses that. ' +
      'turns spins the part about the target axis in quarter turns (0–3; fractions allowed); offset moves it along the target axis, mm (a gap is positive). ' +
      'Start from the closest orientation: turns 0 keeps the part as near its current rotation as the alignment allows. ' +
      'The mate is kept: when either part is moved or remodeled, the part follows; moving it yourself releases the mate, and a port that disappears is reported as a broken mate. ' +
      'frame instead of target puts the port on a skeleton joint’s axis. joint on a coaxial or slider mate also declares the joint (through define_joints): a servo output on either side becomes its actuator, the servo side is the parent and the other part the child unless you list them.',
    inputSchema: {
      part: z.string().describe('The part to move'),
      port: z.string().describe('Its port name, from get_ports or find_parts'),
      target: z.string().optional().describe('The fixed part'),
      target_port: z.string().optional(),
      frame: z.string().optional().describe('Or a skeleton joint id: the port goes on that joint’s axis'),
      type: z.enum(['fastened', 'coaxial', 'face', 'press_fit', 'slider']).default('fastened'),
      turns: z.number().min(-4).max(4).optional(),
      offset: z.number().min(-500).max(500).optional(),
      flip: z.boolean().optional(),
      joint: z
        .object({
          id: z.string().regex(/^[a-z0-9_-]+$/),
          name: z.string().max(60).optional(),
          range: z.tuple([z.number().min(-2000).max(0), z.number().min(0).max(2000)]).optional(),
          limb: z.enum(['leg', 'arm', 'neck', 'torso', 'other']).optional(),
          parent: z.array(z.string()).min(1).max(40).optional(),
          child: z.array(z.string()).min(1).max(80).optional(),
          parent_joint: z.string().optional(),
        })
        .optional()
        .describe('Declare this coaxial (revolute) or slider (prismatic) mate as a joint'),
    },
  },
  handler: async ({ target_port, ...args }) => {
    try {
      await settledWrites([args.part, ...(args.target ? [args.target] : [])]);

      const res = await bridge('mate', { ...args, targetPort: target_port });

      return text((res?.text ?? '') + (await clashText([args.part])));
    } catch (err) {
      return fail(err);
    }
  },
};

async function recompile(recode) {
  const results = await Promise.all(recode.map((r) => renderPart(r.language, r.code)));
  const updates = [];
  const problems = [];

  results.forEach((res, i) => {
    const { id, language, code } = recode[i];

    if (!res.ok) {
      problems.push(`${id}: holes not cut, the code didn't compile (${String(res.error).split('\n')[0]})`);

      return;
    }

    updates.push({
      op: 'update',
      part: {
        id,
        cad: {
          language,
          code,
          positions: res.positions,
          indices: res.indices,
          edges: res.edges,
          stats: res.stats,
          ...(res.ports ? { ports: res.ports } : {}),
        },
      },
    });
  });

  return { updates, problems };
}

async function runFasten(args) {
  await settledWrites(args.through);

  const plan = await bridge('fasten_plan', args);
  const { updates, problems } = await recompile(plan.recode ?? []);
  const applied = await bridge('apply', { ops: [...plan.ops, ...updates] });
  const placed = plan.ops.map((o) => o.part.id);

  return [plan.text, ...problems, applied.summary].filter(Boolean).join('\n') + (await clashText(placed));
}

export const fasten = {
  name: 'fasten',
  config: {
    title: 'Fasten',
    description:
      'Places a real screw joint in one call: picks the ISO stock length from the grip and the thread engagement, places the screw (and washer, heat-set insert or nut) from the catalog, cuts the holes in the CAD parts it passes through (clearance, insert hole) and checks the driver can reach the head. ' +
      'through: the parts the screw passes, head side first. into: "insert" (a heat-set insert in the last part of through; the thread engages the whole insert), "nut" (a hex nut on the far side) or "<part id>:<port>" (a tapped hole of a catalog part, e.g. "hip-servo:horn-1"; the axis comes from the port). ' +
      'at and from (Z up) give the axis when into isn’t a port: at is any point on the screw axis, from is the direction the head and the driver are on. ' +
      'Holes are added to each CAD part’s code (get_part_code shows them). Returns what it placed, the length and why, and the driver check.',
    inputSchema: {
      size: z.enum(['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6']),
      head: z.enum(['socket_head', 'button_head', 'pan_head']).default('socket_head'),
      through: z.array(z.string()).min(1).max(6),
      into: z.string().describe('"insert", "nut" or "<part id>:<port name>"'),
      at: vec3.optional(),
      from: vec3.optional(),
      washer: z.boolean().optional(),
      id: idSchema.optional().describe('Prefix for the new part ids; default <first part>-<size>'),
      finish: z.string().optional(),
      drive: z.enum(['hex', 'torx', 'phillips', 'pozidriv', 'slotted']).optional(),
    },
  },
  handler: async (args) => {
    try {
      return text(await trackWrite(args.through, runFasten(args)));
    } catch (err) {
      return fail(err);
    }
  },
};
