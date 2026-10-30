import { z } from 'zod';
import { auditPart } from '../cad-kernel/client.mjs';
import { craftReport, craftText } from './craftReport.mjs';
import { bridge, fail, text } from './shared.mjs';

const BATCH = 8;
const measured = new Map();

const cacheKey = (p) => `${p.id}|${p.cad.triangles}|${p.cad.volume}`;

async function measureMissing(parts) {
  const missing = parts.filter((p) => p.cad && !p.cad.craft && !measured.has(cacheKey(p)));

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const { meshes = {} } = await bridge('part_meshes', { ids: batch.map((p) => p.id) });
    const audits = await Promise.all(batch.map((p) => (meshes[p.id] ? auditPart(meshes[p.id]) : null)));

    batch.forEach((p, k) => measured.set(cacheKey(p), audits[k]?.audit?.craft ?? null));
  }
}

export const craftReview = {
  name: 'craft_review',
  config: {
    title: 'Craft review',
    description:
      'Reviews how expertly designed the robot looks, with metrics measured on expert robots (SO-101, Open Duck Mini), each part weighted by how much of it shows from outside: envelope sharpness, printed bricks, radius ladder, shell walls, fastener vocabulary and exposed screw heads. WARN rows are hints, not gates. Pass faceted: true when the design language is deliberately hard-edged. Run it after the detail pass.',
    inputSchema: {
      faceted: z.boolean().default(false).describe('The design language is deliberately faceted and hard-edged'),
    },
  },
  handler: async ({ faceted }) => {
    try {
      const { parts = [] } = await bridge('craft', {}, 180000);

      await measureMissing(parts);

      const rated = parts.map((p) => ({ ...p, craft: p.cad ? (p.cad.craft ?? measured.get(cacheKey(p))) : null }));
      const unrated = rated.filter((p) => p.cad && !p.craft).length;

      return text(craftText(craftReport(rated, { faceted }), unrated));
    } catch (err) {
      return fail(err);
    }
  },
};
