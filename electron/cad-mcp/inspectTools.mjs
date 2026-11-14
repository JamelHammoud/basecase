import { z } from 'zod';
import { autoCompareText, blockOutPending } from './autoCompare.mjs';
import { imageCaps } from './imageCaps.mjs';
import { settledWrites } from './pendingWrites.mjs';
import { lineMemory, reportLines } from './repeatLines.mjs';
import { VIEW, bridge, fail, text } from './shared.mjs';
import { plural } from '../plural.mjs';
import { percent } from '../percent.mjs';

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
        .describe('Flat color per part with a numbered label, the same number in every view, and a legend'),
      grid: z.boolean().optional().describe('Draw a mm grid at the model’s center plane (straight views)'),
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

const TOUCH_MM = 1;
const ISLAND_NAMED = 4;

function reachedFrom(start, bodies) {
  const reached = new Set(start);
  const queue = [...start];

  while (queue.length) {
    const p = queue.pop();

    for (const o of bodies) {
      if (reached.has(o) || gap(p.bounds, o.bounds) > TOUCH_MM) continue;

      reached.add(o);
      queue.push(o);
    }
  }

  return reached;
}

function islandText(island) {
  const shown = island.filter((p) => !p.hidden);

  if (shown.length === 1 && island.length === 1) return `${shown[0].id}: floating (touches nothing)`;

  const names = shown.slice(0, ISLAND_NAMED).map((p) => p.id);
  const rest = shown.length - names.length;
  const low = Math.min(...island.map((p) => p.bounds.min[2]));

  return `${names.join(', ')}${rest ? ` and ${rest} more` : ''}: floating ${low.toFixed(1)} mm above the floor, touching only each other`;
}

function floatingIssues(bodies) {
  const reached = reachedFrom(
    bodies.filter((p) => p.bounds.min[2] <= TOUCH_MM),
    bodies,
  );
  const issues = [];

  for (const p of bodies) {
    if (reached.has(p)) continue;

    const island = [...reachedFrom([p], bodies)];

    island.forEach((q) => reached.add(q));

    if (island.some((q) => !q.hidden)) issues.push(islandText(island));
  }

  return issues;
}

function placementIssues(physical) {
  const bodies = physical.filter((p) => p.role !== 'cutout');
  const below = bodies
    .filter((p) => !p.hidden && p.bounds.min[2] < -0.5)
    .map((p) => `${p.id}: ${Math.abs(p.bounds.min[2]).toFixed(1)} mm below the floor`);

  return [...below, ...floatingIssues(bodies)];
}

function interferenceText(it) {
  if (it.insert) {
    return `${it.insert.id} in ${it.b}: the hole is about Ø${it.insert.holeMm} mm; this insert needs a Ø${it.insert.needMm} mm printed hole. Widen the hole.`;
  }

  if (it.screw) {
    return `${it.screw.id} ↔ ${it.screw.into}: the screw runs up to ${it.depthMm} mm into ${it.screw.into}. Catalog parts model their real holes, so line the screw up with the hole (or shorten it if it bottoms out).`;
  }

  const share = it.fraction >= 0.01 ? ` (${percent(it.fraction)} of the smaller part inside)` : '';

  return `${it.a} ↔ ${it.b}: pass through each other, up to ${it.depthMm} mm deep${share}. Cut a pocket or hole, move one, or resize.`;
}

const CLASHES_SHOWN = 30;
const FLUSH_SHOWN = 8;
const LINES_SHOWN = 40;

export const coplanarText = (c) =>
  `${c.a} / ${c.b}: ${c.areaMm2} mm² of coincident same-facing surface, so one skin lies inside the other. If ${c.a} sits in ${c.b}, cut its recess; otherwise trim the overlap. Don't offset parts to hide it.`;

async function interferenceIssues() {
  try {
    const { items = [], coplanar = [], twins = [] } = (await bridge('interference', { twins: true }, 120000)) ?? {};

    return { clashes: items.map(interferenceText), flush: coplanar.map(coplanarText), twins };
  } catch (err) {
    return { clashes: [`(interference check unavailable: ${String(err?.message ?? err)})`], flush: [], twins: [] };
  }
}

const FINISHED_KINDS = new Set([
  'boolean',
  'cad_part',
  'component',
  'custom_model',
  'hardware',
  'image_plane',
  'mesh',
  'sculpt_mesh',
]);

function primitiveIssues(solids) {
  const primitives = solids.filter(
    (p) =>
      p.role === 'solid' &&
      !p.supply &&
      p.kind &&
      !FINISHED_KINDS.has(String(p.kind).split(' ')[0]) &&
      !String(p.kind).startsWith('cad'),
  );

  if (!primitives.length) return [];

  return [
    `Replace ${plural(primitives.length, 'block-out primitive')} with model_part or a catalog part: ${primitives
      .slice(0, 20)
      .map((p) => p.id)
      .join(', ')}${primitives.length > 20 ? '…' : ''}`,
  ];
}

const remember = lineMemory();
let checkedBefore = false;

function issueLines({ clashes, flush, others }) {
  const tucked = new Set([...clashes.slice(CLASHES_SHOWN), ...flush.slice(FLUSH_SHOWN)]);
  const memory = remember([...clashes, ...others, ...flush]);
  const shown = (lines) => lines.filter((l) => !tucked.has(l));
  const lines = reportLines(
    { ...memory, fresh: shown(memory.fresh), unchanged: shown(memory.unchanged) },
    !checkedBefore,
  );
  const notes = [
    ...(clashes.length > CLASHES_SHOWN ? [`- …and ${clashes.length - CLASHES_SHOWN} more interferences`] : []),
    ...(flush.length > FLUSH_SHOWN ? [`- …and ${flush.length - FLUSH_SHOWN} smaller coincident faces`] : []),
    ...(lines.length > LINES_SHOWN ? [`- …and ${lines.length - LINES_SHOWN} more lines`] : []),
  ];

  checkedBefore = true;

  return [...lines.slice(0, LINES_SHOWN), ...notes];
}

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
      await settledWrites();

      const scene = await bridge('snapshot', {});
      const physical = (scene.parts || []).filter((p) => p.role !== 'reference' && !p.referenceImage && p.bounds);
      const solids = physical.filter((p) => !p.hidden);
      const { clashes, flush, twins } = await interferenceIssues();
      const others = [...placementIssues(physical), ...primitiveIssues(solids), ...twins];
      const b = scene.bounds;
      const head = `${plural(solids.length, 'part')}${b ? `, overall ${b.size.map((v) => Math.round(v)).join(' × ')} mm (x × y × z)` : ''}.`;
      const lines = issueLines({ clashes, flush, others });
      const report = lines.length ? `${head}\nIssues:\n${lines.join('\n')}` : `${head}\nNo issues found.`;

      return text(report + (await autoCompareText()));
    } catch (err) {
      return fail(err);
    }
  },
};
