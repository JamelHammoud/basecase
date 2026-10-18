#!/usr/bin/env node
/** Re-scores saved runs with the current scorer (updates summary.json):  node bench/rescore.mjs <run …> */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStl } from './geometry.mjs';
import { scoreModels, writeOverlay } from './score.mjs';
import { ROBOTS } from './robots.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
for (const run of process.argv.slice(2)) {
  for (const robot of fs.readdirSync(path.join(here, 'runs', run))) {
    const dir = path.join(here, 'runs', run, robot);
    const ref = path.join(here, 'data', robot, 'reference.stl');
    if (!fs.existsSync(path.join(dir, 'summary.json')) || !fs.existsSync(ref)) continue;
    const summary = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
    const parts = JSON.parse(fs.readFileSync(path.join(dir, 'parts.json'), 'utf8'));
    const refMeta = JSON.parse(fs.readFileSync(path.join(here, 'data', robot, 'reference.json'), 'utf8'));
    const s = scoreModels(parseStl(fs.readFileSync(ref)), parseStl(fs.readFileSync(path.join(dir, 'agent.stl'))), {
      agentParts: parts.filter((p) => p.role === 'solid' && p.visible).length,
      refParts: refMeta.parts,
      allOrientations: !!ROBOTS[robot]?.allOrientations,
    });
    writeOverlay(path.join(dir, 'overlay.png'), s.views);
    const { views, ...score } = s;
    void views;
    summary.score = score;
    fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 1));
    console.log(run, robot, score.total);
  }
}
