import { z } from 'zod';
import { VIEW, bridge, fail, text } from './shared.mjs';

export const look = {
  name: 'look',
  config: {
    title: 'Look',
    description:
      'Renders the model and returns images. Views: iso, front (looking at the front, from −Y), back, side (from +X, the left side), top, or any angle as "az:<deg>,el:<deg>" (az 0 = front, 90 = left side, −90 = right side; el = degrees above horizontal). ' +
      'Pass ids to render only those parts (inspect one part or one subassembly up close). Use after every part or subassembly, and on the whole model after each stage.',
    inputSchema: {
      views: z.array(VIEW).min(1).max(4).default(['iso', 'front']),
      ids: z.array(z.string()).optional().describe('Only show these parts'),
    },
  },
  handler: async ({ views, ids }) => {
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
  },
};

function gap(a, b) {
  let g = -Infinity;

  for (let i = 0; i < 3; i++) g = Math.max(g, a.min[i] - b.max[i], b.min[i] - a.max[i]);

  return g;
}

function placementIssues(solids) {
  const boxes = solids.map((p) => ({ p, b: p.bounds }));
  const issues = [];

  for (const { p, b } of boxes) {
    if (b.min[2] < -0.5) issues.push(`${p.id}: ${Math.abs(b.min[2]).toFixed(1)} mm below the floor`);

    const onFloor = Math.abs(b.min[2]) <= 1;
    const touching = boxes.some((o) => o.p !== p && gap(b, o.b) <= 1);

    if (!onFloor && !touching && p.role !== 'cutout') issues.push(`${p.id}: floating (touches nothing)`);
  }

  return issues;
}

function interferenceText(it) {
  if (it.insert) {
    return `${it.insert.id} in ${it.b}: the hole is about Ø${it.insert.holeMm} mm; this insert needs a Ø${it.insert.needMm} mm printed hole. Widen the hole.`;
  }

  if (it.screw) {
    return `${it.screw.id} ↔ ${it.screw.into}: the screw runs up to ${it.depthMm} mm into ${it.screw.into}. Catalog parts model their real holes, so line the screw up with the hole (or shorten it if it bottoms out).`;
  }

  return `${it.a} ↔ ${it.b}: pass through each other, up to ${it.depthMm} mm deep (${Math.round(it.fraction * 100)}% of the smaller part inside). Cut a pocket or hole, move one, or resize.`;
}

async function interferenceIssues() {
  const issues = [];

  try {
    const { items = [], coplanar = [] } = (await bridge('interference', {}, 120000)) ?? {};

    for (const c of coplanar.slice(0, 20)) {
      issues.push(
        `${c.a} / ${c.b}: ${c.areaMm2} mm² of flush same-facing surface (renders as flicker). Set the panel, decal or cover 0.2–0.5 mm proud or inset, or cut a recess for it.`,
      );
    }

    for (const it of items.slice(0, 30)) issues.push(interferenceText(it));

    if (items.length > 30) issues.push(`…and ${items.length - 30} more interferences`);
  } catch (err) {
    issues.push(`(interference check unavailable: ${String(err?.message ?? err)})`);
  }

  return issues;
}

const FINISHED_KINDS = new Set(['cad_part', 'component', 'hardware', 'image_plane', 'mesh']);

function primitiveIssues(solids) {
  const primitives = solids.filter(
    (p) => p.role === 'solid' && p.kind && !FINISHED_KINDS.has(p.kind) && !String(p.kind).startsWith('cad'),
  );

  if (!primitives.length) return [];

  return [
    `${primitives.length} solid parts are still block-out primitives (replace each with model_part or a catalog part): ${primitives
      .slice(0, 20)
      .map((p) => p.id)
      .join(', ')}${primitives.length > 20 ? '…' : ''}`,
  ];
}

function twinIssues(solids) {
  const byId = new Map(solids.map((p) => [p.id, p]));
  const issues = [];

  for (const p of solids) {
    if (!/(^|-)left(-|$)/.test(p.id)) continue;

    const twin = byId.get(p.id.replace(/(^|-)left(-|$)/, '$1right$2'));

    if (!twin) issues.push(`${p.id}: no right-side twin`);
  }

  return issues;
}

export const checkScene = {
  name: 'check_scene',
  config: {
    title: 'Check model',
    description:
      'Model checks: parts that pass THROUGH each other (mesh-level interference with depth; parts may touch but never interpenetrate, so an inserted servo or screw needs its pocket or hole cut), solid parts still left as block-out primitives, floating parts, parts below the floor (z < 0), and missing left/right twins. Run it after each subassembly and before you finish; fix every interference and primitive.',
    inputSchema: {},
  },
  handler: async () => {
    try {
      const scene = await bridge('snapshot', {});
      const solids = (scene.parts || []).filter(
        (p) => p.role !== 'reference' && !p.referenceImage && !p.hidden && p.bounds,
      );
      const issues = [
        ...placementIssues(solids),
        ...(await interferenceIssues()),
        ...primitiveIssues(solids),
        ...twinIssues(solids),
      ];
      const b = scene.bounds;
      const head = `${solids.length} parts${b ? `, overall ${b.size.map((v) => Math.round(v)).join(' × ')} mm (x × y × z)` : ''}.`;

      return text(
        issues.length ? `${head}\nIssues:\n- ${issues.slice(0, 40).join('\n- ')}` : `${head}\nNo issues found.`,
      );
    } catch (err) {
      return fail(err);
    }
  },
};
