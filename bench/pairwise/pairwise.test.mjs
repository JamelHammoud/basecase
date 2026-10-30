import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { agreement, fitBradleyTerry, winProbability } from './bradleyTerry.mjs';
import { combineVerdicts, judgePair } from './judge.mjs';
import { readLabels } from './labels.mjs';

function seededRandom(seed) {
  let s = seed;

  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;

    return s / 2 ** 31;
  };
}

describe('Bradley–Terry', () => {
  it('recovers the order of hidden strengths from noisy pairwise wins', () => {
    const truth = { a: 4, b: 2, c: 1, d: 0.5 };
    const ids = Object.keys(truth);
    const rand = seededRandom(7);
    const comparisons = [];

    for (let n = 0; n < 400; n++) {
      const [x, y] = [ids[Math.floor(rand() * 4)], ids[Math.floor(rand() * 4)]];

      if (x === y) continue;

      comparisons.push({ itemA: x, itemB: y, winner: rand() < truth[x] / (truth[x] + truth[y]) ? 'a' : 'b' });
    }

    const ranking = fitBradleyTerry(comparisons);

    expect(ranking.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(winProbability(ranking, 'a', 'd')).toBeGreaterThan(0.8);
  });

  it('counts ties as half a win, skips unknowns and stays finite for an unbeaten item', () => {
    const ranking = fitBradleyTerry([
      { itemA: 'x', itemB: 'y', winner: 'a' },
      { itemA: 'x', itemB: 'y', winner: 'a' },
      { itemA: 'y', itemB: 'z', winner: 'tie' },
      { itemA: 'x', itemB: 'z', winner: 'unknown' },
    ]);

    expect(ranking[0]).toMatchObject({ id: 'x', wins: 2, losses: 0 });
    expect(Number.isFinite(ranking[0].strength)).toBe(true);
    expect(ranking.find((r) => r.id === 'z').ties).toBe(1);
  });
});

describe('pairwise judge', () => {
  it('asks twice with the order swapped and only keeps a winner both orders agree on', async () => {
    const prompts = [];
    const prefersA = async (prompt, cwd) => {
      prompts.push(prompt);

      const first = fs.readFileSync(path.join(cwd, /FIRST: (\S+)/.exec(prompt)[1]), 'utf8');

      return { text: JSON.stringify({ winner: first === 'A' ? 'first' : 'second', reason: 'r' }), costUsd: 0.01 };
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-'));
    const [a, b] = ['a.png', 'b.png'].map((f) => path.join(dir, f));

    fs.writeFileSync(a, 'A');
    fs.writeFileSync(b, 'B');

    const alwaysFirst = async () => ({ text: '{"winner": "first", "reason": "position bias"}', costUsd: 0.01 });
    const biased = await judgePair({ a, b, run: alwaysFirst, random: () => 0.1 });

    expect(biased).toMatchObject({ winner: 'unknown', consistent: false, costUsd: 0.02 });
    expect(biased.calls.map((c) => c.order)).toEqual(['ab', 'ba']);

    const fair = await judgePair({ a, b, run: prefersA, random: () => 0.9 });

    expect(fair).toMatchObject({ winner: 'a', consistent: true });
    expect(fair.calls.map((c) => c.order)).toEqual(['ba', 'ab']);
    expect(prompts.every((p) => !/a\.png|b\.png/.test(p))).toBe(true);
    expect(
      combineVerdicts([
        { order: 'ab', winner: 'first' },
        { order: 'ba', winner: 'second' },
      ]),
    ).toMatchObject({ winner: 'a', consistent: true });
    expect(
      combineVerdicts([
        { order: 'ab', winner: 'unknown' },
        { order: 'ba', winner: 'second' },
      ]),
    ).toMatchObject({ winner: 'unknown', consistent: true });
  });
});

describe('labels and agreement', () => {
  it('reads the label file and reports agreement, abstentions and order flips', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-'));
    const file = path.join(dir, 'craft.jsonl');

    fs.writeFileSync(
      file,
      [
        '# craft labels',
        '{"id": "p1", "a": "renders/head-v3.png", "b": "renders/head-v1.png", "winner": "a", "labeler": "jamel", "items": {"a": "head-v3", "b": "head-v1"}}',
        '{"id": "p2", "a": "x.png", "b": "y.png", "winner": "b"}',
        '{"id": "p3", "a": "x.png", "b": "z.png", "winner": "a"}',
      ].join('\n'),
    );

    const labels = readLabels(file);

    expect(labels[0]).toMatchObject({ itemA: 'head-v3', a: path.join(dir, 'renders/head-v3.png'), aspect: 'craft' });

    const report = agreement(labels, [
      { id: 'p1', winner: 'a', consistent: true },
      { id: 'p2', winner: 'a', consistent: true },
      { id: 'p3', winner: 'unknown', consistent: false },
    ]);

    expect(report).toMatchObject({ pairs: 3, bothDecisive: 2, agreePct: 50, judgeAbstainPct: 33.3, misses: ['p2'] });
    fs.writeFileSync(file, '{"id": "p", "a": "x"}');
    expect(() => readLabels(file)).toThrow(/two images/);
  });
});
