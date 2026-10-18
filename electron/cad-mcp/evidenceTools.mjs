import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { EVIDENCE_DIR, IMAGE_EXT, evidencePath, fail, text } from './shared.mjs';

export const listEvidence = {
  name: 'list_evidence',
  config: {
    title: 'List evidence',
    description:
      'Lists every file the user attached as evidence (photos, notes, URDFs, specs, mesh summaries), grouped by folder, newest folder first. Paths are what read_evidence takes.',
    inputSchema: { folder: z.string().optional().describe('Only this folder id') },
  },
  handler: async ({ folder }) => {
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
        } catch {}

        lines.push(`${name} (${f.id}):`);

        const walk = (dir) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith('.') || count >= 1000) continue;

            const full = path.join(dir, e.name);

            if (e.isDirectory()) walk(full);
            else {
              count++;
              lines.push(
                `- ${path.relative(EVIDENCE_DIR, full).split(path.sep).join('/')} (${Math.max(1, Math.round(fs.statSync(full).size / 1024))} KB)`,
              );
            }
          }
        };

        walk(path.join(EVIDENCE_DIR, f.id));
      }

      return text(lines.length ? lines.join('\n') : 'No evidence attached.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const readEvidence = {
  name: 'read_evidence',
  config: {
    title: 'Read evidence',
    description:
      'Opens files the user attached as evidence. Images come back as images to study; text files (notes, specs, URDF/MJCF, BOMs, code) and .mesh.txt summaries (exact bounding box and volume of an attached STL) come back as text. ' +
      'Read every attached file before planning; pass several image paths at once to compare views.',
    inputSchema: {
      paths: z
        .array(z.string())
        .min(1)
        .max(8)
        .describe('Paths from the evidence listing, e.g. "ev-abc/photos/front.jpg"'),
      offset: z.number().int().min(0).optional().describe('Character offset for long text files'),
    },
  },
  handler: async ({ paths, offset = 0 }) => {
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
          const more =
            offset + chunk.length < body.length
              ? `\n[…${body.length - offset - chunk.length} more characters: read again with offset ${offset + chunk.length}]`
              : '';

          content.push({ type: 'text', text: `${p}:\n${chunk}${more}` });
        }
      } catch (err) {
        content.push({ type: 'text', text: `${p}: ${String(err?.message ?? err)}` });
      }
    }

    return { content };
  },
};
