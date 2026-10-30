#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readIndex } from './archive.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const runsDir = path.join(here, 'runs');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const named = args.filter((a) => !a.startsWith('--'));

const money = (v) => (typeof v === 'number' ? `$${v.toFixed(2)}` : '—');
const kTokens = (t) => (t?.total ? `${Math.round(t.total / 1000)}K` : '—');
const minutes = (s) => (typeof s === 'number' ? `${Math.round(s / 60)}m` : '—');

function runDirs() {
  if (named.length) return named;

  if (!fs.existsSync(runsDir)) return [];

  return fs
    .readdirSync(runsDir)
    .filter((d) => !d.startsWith('_') && fs.statSync(path.join(runsDir, d)).isDirectory())
    .sort();
}

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function scoreCells(sc) {
  if (!sc) return ['—', '—', '—', '—'];

  return [sc.total, sc.silhouetteIoU.mean, `${sc.chamferMm} (${sc.chamferPctOfHeight}%)`, sc.sizeRatio.join(' / ')];
}

function robotRow(run, robot) {
  const dir = path.join(runsDir, run, robot);
  const s = readJson(path.join(dir, 'summary.json'));

  if (!s?.robot) return null;

  s.judge = readJson(path.join(dir, 'judge.json')) ?? s.judge;

  const m = s.metrics ?? {};

  return [
    run,
    robot,
    ...scoreCells(s.score),
    `${s.cadParts}/${s.parts}`,
    s.score ? s.score.parts.real : '—',
    minutes(m.seconds ?? s.seconds),
    money(m.costUsd),
    kTokens(m.tokens),
    m.toolCalls ?? s.toolCalls ?? '—',
    s.failedTools,
    s.primitives ?? '—',
    s.interferences !== undefined ? `${s.interferences} (${s.worstInterferenceMm} mm)` : '—',
    s.drawing ? s.drawing.iou : '—',
    s.judge ? s.judge.score : '—',
  ];
}

const HEAD = [
  'run',
  'robot',
  'score',
  'IoU',
  'chamfer mm',
  'size ratio x/y/z',
  'cad/all parts',
  'real parts',
  'time',
  'cost',
  'tokens',
  'tool calls',
  'failed tools',
  'primitives',
  'interferences (worst)',
  'drawing IoU',
  'judge',
];

function table(head, rows) {
  return [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ];
}

export function robotReport(runs) {
  const rows = runs.flatMap((run) =>
    fs.existsSync(path.join(runsDir, run))
      ? fs
          .readdirSync(path.join(runsDir, run))
          .sort()
          .map((robot) => robotRow(run, robot))
          .filter(Boolean)
      : [],
  );

  return table(HEAD, rows).join('\n');
}

export function indexReport(entries) {
  const rows = entries
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => [
      e.at.slice(0, 16).replace('T', ' '),
      e.run,
      e.task,
      e.kind,
      e.commit ? `${e.commit}${e.dirty ? '*' : ''}` : '—',
      e.score ?? e.grade ?? '—',
      e.judge ?? '—',
      minutes(e.seconds),
      money(e.costUsd),
      kTokens(e.tokens),
      e.toolCalls ?? '—',
    ]);

  return table(
    ['date', 'run', 'task', 'kind', 'commit', 'score / grade', 'judge', 'time', 'cost', 'tokens', 'tool calls'],
    rows,
  ).join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const filter = (e) => !named.length || named.includes(e.run);

  console.log(flags.has('--index') ? indexReport(readIndex(runsDir).filter(filter)) : robotReport(runDirs()));
}
