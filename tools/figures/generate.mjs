#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs, startStudio } from '../parts/studioRun.mjs';
import { FIGURES, REVIEW } from './briefs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const { port, ids } = cliArgs();
const unknown = ids.filter((id) => !FIGURES[id]);

if (ids.length === 0 || unknown.length) {
  console.error(`Usage: node tools/figures/generate.mjs <${Object.keys(FIGURES).join('|')}…> [--port 5381]`);
  process.exit(1);
}

const started = Date.now();
const log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);
const studio = await startStudio({ port, log });

for (const id of ids) {
  const figure = FIGURES[id];
  const out = path.join(here, 'generated', id);

  await studio.newConversation();
  log(`${id}: sculpting`);

  const result = await studio.prompt(figure.prompt, []);

  log(`${id}: agent finished (${result.stopReason ?? result.error})`);
  studio.reply.text = '';

  const review = await studio.prompt(REVIEW, []);

  log(`${id}: reviewed (${review.stopReason ?? review.error})`);

  const stat = await studio.exportGlb(id, {
    source: 'agent',
    triangleBudget: 60000,
    outDir: path.join(root, 'public', 'figures'),
    stats: false,
  });

  if (!stat) {
    const parts = await studio.parts();

    log(`${id}: the agent produced no solid parts (${parts.length} in the scene)`, JSON.stringify(parts).slice(0, 600));
    log(`${id}: last reply`, studio.reply.text.trim().slice(0, 1500));

    continue;
  }

  log(`${id}: ${stat.size.join(' × ')} mm, ${stat.triangles} triangles`);
  await studio.saveRecord(out, ['iso', 'front', 'side', 'back']);
  fs.writeFileSync(
    path.join(out, 'notes.md'),
    `# ${figure.name}\n\nSculpted by the studio agent on ${new Date().toISOString().slice(0, 10)} from tools/figures/briefs.mjs.\n\nEnvelope: ${stat.size.join(' × ')} mm (studio frame, Y up).\n\n${studio.reply.text.trim()}\n`,
  );
}

await studio.close();
process.exit(0);
