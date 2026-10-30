import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractJson, runClaude } from '../judge.mjs';

export const ASPECTS = {
  craft:
    'Which part or robot looks more expertly designed, the way a professional industrial designer and mechanical engineer would make it: purposeful fillets and chamfers, consistent radii and wall thickness, clean split lines, fasteners and features that look intentional, nothing blocky or arbitrary.',
  replica:
    'Which model matches the real robot in the reference photos more closely: proportions, shell shapes, structure and characteristic details.',
  brief: 'Which model satisfies the design brief better and would a hardware team rather start from.',
  buildable:
    'Which design looks more buildable: every part has a way in, fasteners are reachable, parts are held, and electronics can be serviced.',
};

function stage(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pairwise-'));
  const names = {};

  for (const [name, src] of Object.entries(files)) {
    const file = `${name}${path.extname(src) || '.png'}`;

    fs.copyFileSync(src, path.join(dir, file));
    names[name] = file;
  }

  return { dir, names };
}

export function pairPrompt({ aspect, names, refs = [], brief }) {
  return [
    'You compare two renders, FIRST and SECOND, as a strict reviewer. Ignore render style, colour, background, camera angle and which one you saw first.',
    `Question: ${ASPECTS[aspect] ?? aspect}`,
    brief ? `Brief: ${brief}` : '',
    refs.length ? `Reference photos (open each with Read): ${refs.join(', ')}` : '',
    `FIRST: ${names.first}`,
    `SECOND: ${names.second}`,
    'Open every image with Read. If they are equally good, or you cannot tell, answer unknown: a wrong pick is worse than unknown.',
    'Reply with ONLY a JSON object: {"winner": "first" | "second" | "unknown", "reason": "<one short sentence>"}',
  ]
    .filter(Boolean)
    .join('\n');
}

async function askOnce({ first, second, aspect, refs, brief, run }) {
  const refFiles = Object.fromEntries((refs ?? []).map((r, i) => [`reference-${i + 1}`, r]));
  const { dir, names } = stage({ first, second, ...refFiles });

  try {
    const refNames = Object.keys(refFiles).map((k) => names[k]);
    const { text, costUsd } = await run(pairPrompt({ aspect, names, refs: refNames, brief }), dir);
    const verdict = extractJson(text, 'winner');
    const winner = ['first', 'second'].includes(verdict?.winner) ? verdict.winner : 'unknown';

    return { winner, reason: verdict?.reason ?? text.slice(0, 200), costUsd };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const toAB = (order, winner) => {
  if (winner === 'unknown') return 'unknown';

  return (order === 'ab') === (winner === 'first') ? 'a' : 'b';
};

export function combineVerdicts(calls) {
  const picks = calls.map((c) => toAB(c.order, c.winner));
  const decisive = picks.filter((p) => p !== 'unknown');
  const agree = picks.every((p) => p === picks[0]);
  const flipped = decisive.length === 2 && decisive[0] !== decisive[1];

  return { winner: agree ? picks[0] : 'unknown', consistent: !flipped, picks };
}

export async function judgePair({ a, b, aspect = 'craft', refs, brief, run = runClaude, random = Math.random }) {
  const firstOrder = random() < 0.5 ? 'ab' : 'ba';
  const orders = [firstOrder, firstOrder === 'ab' ? 'ba' : 'ab'];
  const calls = [];

  for (const order of orders) {
    const [first, second] = order === 'ab' ? [a, b] : [b, a];

    calls.push({ order, ...(await askOnce({ first, second, aspect, refs, brief, run })) });
  }

  const costs = calls.map((c) => c.costUsd).filter((v) => typeof v === 'number');

  return {
    ...combineVerdicts(calls),
    calls,
    costUsd: costs.length ? Math.round(costs.reduce((s, v) => s + v, 0) * 10000) / 10000 : null,
  };
}
