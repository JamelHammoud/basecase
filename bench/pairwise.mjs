#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agreement, fitBradleyTerry } from './pairwise/bradleyTerry.mjs';
import { judgePair } from './pairwise/judge.mjs';
import { appendJsonl, readJudgements, readLabels } from './pairwise/labels.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const [command, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => (rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1] : fallback);
const positional = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));
const aspect = flag('aspect', 'craft');
const refs = flag('refs', '')
  .split(',')
  .filter(Boolean)
  .map((r) => path.resolve(r));

async function pair() {
  const [a, b] = positional.map((p) => path.resolve(p));
  const verdict = await judgePair({ a, b, aspect, refs, brief: flag('brief', undefined) });

  console.log(JSON.stringify(verdict, null, 1));
}

async function judgeLabels() {
  const [labelsFile] = positional;
  const out = flag('out', labelsFile.replace(/\.jsonl$/, '') + '.judged.jsonl');
  const done = new Set(readJudgements(out).map((j) => j.id));

  for (const l of readLabels(labelsFile).filter((x) => !done.has(x.id))) {
    const v = await judgePair({ a: l.a, b: l.b, aspect: l.aspect, refs });

    appendJsonl(out, {
      id: l.id,
      itemA: l.itemA,
      itemB: l.itemB,
      aspect: l.aspect,
      at: new Date().toISOString(),
      ...v,
    });
    console.log(
      `${l.id}: judge ${v.winner}${l.winner ? `, label ${l.winner}` : ''}${v.consistent ? '' : ' (flipped with order)'}`,
    );
  }

  console.log(`Judgements in ${out}`);
}

function agree() {
  const [labelsFile, judgedFile] = positional;

  console.log(JSON.stringify(agreement(readLabels(labelsFile), readJudgements(judgedFile)), null, 1));
}

function rank() {
  const comparisons = positional.flatMap((f) => (/\.judged\.jsonl$/.test(f) ? readJudgements(f) : readLabels(f)));
  const ranking = fitBradleyTerry(comparisons.filter((c) => c.winner));

  console.log('| item | Elo | wins | losses | ties |\n|---|---|---|---|---|');

  for (const r of ranking) console.log(`| ${r.id} | ${r.elo} | ${r.wins} | ${r.losses} | ${r.ties} |`);
}

async function runs() {
  const [runA, runB, robot] = positional;
  const view = flag('view', 'render-iso.png');
  const file = (run) => path.join(here, 'runs', run, robot, view);
  const verdict = await judgePair({ a: file(runA), b: file(runB), aspect, refs });

  console.log(JSON.stringify({ a: runA, b: runB, robot, view, ...verdict }, null, 1));

  if (flag('log', null))
    appendJsonl(flag('log'), { id: `${runA}|${runB}|${robot}|${view}`, itemA: runA, itemB: runB, aspect, ...verdict });
}

const COMMANDS = { pair, judge: judgeLabels, agree, rank, runs };

if (!COMMANDS[command] || (command !== 'rank' && !positional.length)) {
  console.error(`Usage:
  node bench/pairwise.mjs pair <a.png> <b.png> [--aspect craft|replica|brief|buildable] [--refs r1.jpg,r2.jpg]
  node bench/pairwise.mjs judge <labels.jsonl> [--out labels.judged.jsonl]
  node bench/pairwise.mjs agree <labels.jsonl> <labels.judged.jsonl>
  node bench/pairwise.mjs rank <labels.jsonl|*.judged.jsonl…>
  node bench/pairwise.mjs runs <runA> <runB> <robot> [--view render-iso.png] [--log comparisons.judged.jsonl]`);
  process.exit(1);
}

await COMMANDS[command]();
