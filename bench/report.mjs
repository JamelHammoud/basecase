#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runsDir = path.join(here, 'runs');
const runs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs
      .readdirSync(runsDir)
      .filter((d) => !d.startsWith('_') && fs.statSync(path.join(runsDir, d)).isDirectory())
      .sort();

const rows = [];

for (const run of runs) {
  for (const robot of fs.readdirSync(path.join(runsDir, run)).sort()) {
    const f = path.join(runsDir, run, robot, 'summary.json');

    if (!fs.existsSync(f)) continue;

    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    const jf = path.join(runsDir, run, robot, 'judge.json');

    if (fs.existsSync(jf)) s.judge = JSON.parse(fs.readFileSync(jf, 'utf8'));

    const sc = s.score;

    rows.push([
      run,
      robot,
      sc ? sc.total : '—',
      sc ? sc.silhouetteIoU.mean : '—',
      sc ? `${sc.chamferMm} (${sc.chamferPctOfHeight}%)` : '—',
      sc ? sc.sizeRatio.join(' / ') : '—',
      `${s.cadParts}/${s.parts}`,
      sc ? sc.parts.real : '—',
      `${Math.round(s.seconds / 60)}m`,
      s.failedTools,
      s.primitives ?? '—',
      s.interferences !== undefined ? `${s.interferences} (${s.worstInterferenceMm} mm)` : '—',
      s.drawing ? s.drawing.iou : '—',
      s.judge ? s.judge.score : '—',
    ]);
  }
}

const head = [
  'run',
  'robot',
  'score',
  'IoU',
  'chamfer mm',
  'size ratio x/y/z',
  'cad/all parts',
  'real parts',
  'time',
  'failed tools',
  'primitives',
  'interferences (worst)',
  'drawing IoU',
  'judge',
];

console.log(`| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|`);

for (const r of rows) console.log(`| ${r.join(' | ')} |`);
