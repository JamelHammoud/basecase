import { z } from 'zod';
import { autoCompareText, blockOutPending } from './autoCompare.mjs';
import { imageCaps } from './imageCaps.mjs';
import { lineMemory, reportLines } from './repeatLines.mjs';
import { VIEW, bridge, fail, text } from './shared.mjs';

function legendText(res) {
  const rows = (res.legend ?? []).map((l) => `${l.label} ${l.id}${l.name && l.name !== l.id ? ` (${l.name})` : ''}`);

  return rows.length ? `Labels, the same in every view:\n${rows.join('\n')}` : 'No parts to label.';
}

const shownText = (shot) => (shot.labels ? `: shows ${shot.labels.length ? shot.labels.join(', ') : 'no labels'}` : '');

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
      labels: z
        .boolean()
        .optional()
        .describe('Flat colour per part with a numbered label, the same number in every view, and a legend'),
      grid: z.boolean().optional().describe('Draw a mm grid at the model’s centre plane (straight views)'),
      detail: z.boolean().optional().describe('Render at the largest size this agent reads, for fine detail'),
    },
  },
  handler: async ({ views, ids, labels, grid, detail }) => {
    try {
      const caps = imageCaps();
      const maxSide = detail ? caps.detail : caps.render;
      const res = await bridge('screenshot', { views, ids, labels, grid, maxSide }, 60000);
      const content = labels ? [{ type: 'text', text: legendText(res) }] : [];

      for (const shot of res.images || []) {
        content.push({
          type: 'text',
          text: `${shot.view} view${ids?.length ? ` (${ids.join(', ')})` : ''}${shownText(shot)}`,
        });

        const m = /^data:(image\/\w+);base64,(.+)$/.exec(shot.dataUrl || '');

        if (m) content.push({ type: 'image', mimeType: m[1], data: m[2] });
      }

      if (content.length === 0) content.push({ type: 'text', text: 'Nothing to render.' });

      const checked = !ids?.length && blockOutPending() ? await autoCompareText() : '';

      if (checked) content.push({ type: 'text', text: checked });

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

const FLUSH_SHOWN = 8;

export const coplanarText = (c) =>
  `${c.a} / ${c.b}: ${c.areaMm2} mm² of coincident same-facing surface, so one skin lies inside the other. If ${c.a} sits in ${c.b}, cut its recess; otherwise trim the overlap. Don't offset parts to hide it.`;

async function interferenceIssues() {
  try {
    const { items = [], coplanar = [], twins = [] } = (await bridge('interference', { twins: true }, 120000)) ?? {};

    return {
      clashes: [
        ...items.slice(0, 30).map(interferenceText),
        ...(items.length > 30 ? [`…and ${items.length - 30} more interferences`] : []),
      ],
      flush: [
        ...coplanar.slice(0, FLUSH_SHOWN).map(coplanarText),
        ...(coplanar.length > FLUSH_SHOWN ? [`…and ${coplanar.length - FLUSH_SHOWN} smaller coincident faces`] : []),
      ],
      twins,
    };
  } catch (err) {
    return { clashes: [`(interference check unavailable: ${String(err?.message ?? err)})`], flush: [], twins: [] };
  }
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

const remember = lineMemory();
let checkedBefore = false;

export const checkScene = {
  name: 'check_scene',
  config: {
    title: 'Check model',
    description:
      'Model checks, worst first: parts that pass through each other (mesh interference with depth; a screw, insert or nut in its own clamped stack is expected and not reported, so a fastener line means it hits something else or sits deeper than its thread), floating parts, parts below the floor (z < 0), solid parts still left as block-out primitives, mirrored left/right pairs that differ (clashes, volume or size off by more than 10%), and coincident faces between non-hardware parts. ' +
      'Repeated calls lead with what is new since the last check. Run it after each subassembly and before you finish; fix every interference and primitive. For fastener chains, engagement and what holds each part, run check_assembly.',
    inputSchema: {},
  },
  handler: async () => {
    try {
      const scene = await bridge('snapshot', {});
      const solids = (scene.parts || []).filter(
        (p) => p.role !== 'reference' && !p.referenceImage && !p.hidden && p.bounds,
      );
      const { clashes, flush, twins } = await interferenceIssues();
      const issues = [...clashes, ...placementIssues(solids), ...primitiveIssues(solids), ...twins, ...flush];
      const b = scene.bounds;
      const head = `${solids.length} parts${b ? `, overall ${b.size.map((v) => Math.round(v)).join(' × ')} mm (x × y × z)` : ''}.`;
      const lines = reportLines(remember(issues.slice(0, 40)), !checkedBefore);

      checkedBefore = true;

      const report = lines.length ? `${head}\nIssues:\n${lines.join('\n')}` : `${head}\nNo issues found.`;

      return text(report + (await autoCompareText()));
    } catch (err) {
      return fail(err);
    }
  },
};
