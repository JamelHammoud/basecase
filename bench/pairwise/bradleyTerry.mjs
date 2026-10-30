const DECISIVE = new Set(['a', 'b']);

export function tally(comparisons) {
  const items = new Map();
  const item = (id) => {
    if (!items.has(id)) items.set(id, { id, wins: 0, losses: 0, ties: 0, opponents: new Map() });

    return items.get(id);
  };

  for (const c of comparisons) {
    if (c.winner !== 'tie' && !DECISIVE.has(c.winner)) continue;

    const [a, b] = [item(c.itemA), item(c.itemB)];

    a.opponents.set(b.id, (a.opponents.get(b.id) ?? 0) + 1);
    b.opponents.set(a.id, (b.opponents.get(a.id) ?? 0) + 1);

    if (c.winner === 'tie') {
      a.ties++;
      b.ties++;
    } else {
      const [w, l] = c.winner === 'a' ? [a, b] : [b, a];

      w.wins++;
      l.losses++;
    }
  }

  return items;
}

function mmStep(items, p, prior) {
  const next = new Map();

  for (const it of items.values()) {
    const score = it.wins + it.ties / 2 + prior / 2;
    let denom = prior / (p.get(it.id) + 1);

    for (const [opp, n] of it.opponents) denom += n / (p.get(it.id) + p.get(opp));

    next.set(it.id, score / denom);
  }

  const logMean = [...next.values()].reduce((s, v) => s + Math.log(v), 0) / Math.max(next.size, 1);

  for (const [id, v] of next) next.set(id, v / Math.exp(logMean));

  return next;
}

export function fitBradleyTerry(comparisons, { prior = 1, iterations = 500, tolerance = 1e-9 } = {}) {
  const items = tally(comparisons);
  let p = new Map([...items.keys()].map((id) => [id, 1]));

  for (let i = 0; i < iterations; i++) {
    const next = mmStep(items, p, prior);
    const delta = Math.max(0, ...[...next].map(([id, v]) => Math.abs(Math.log(v) - Math.log(p.get(id)))));

    p = next;

    if (delta < tolerance) break;
  }

  return [...items.values()]
    .map((it) => ({
      id: it.id,
      strength: p.get(it.id),
      elo: Math.round(400 * Math.log10(p.get(it.id))),
      wins: it.wins,
      losses: it.losses,
      ties: it.ties,
    }))
    .sort((x, y) => y.strength - x.strength);
}

export const winProbability = (ranking, a, b) => {
  const pa = ranking.find((r) => r.id === a)?.strength ?? 1;
  const pb = ranking.find((r) => r.id === b)?.strength ?? 1;

  return pa / (pa + pb);
};

const sharePct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

export function agreement(labels, judgements) {
  const judged = new Map(judgements.map((j) => [j.id, j]));
  const pairs = labels.filter((l) => judged.has(l.id) && l.winner);
  const decisive = pairs.filter((l) => DECISIVE.has(l.winner) && DECISIVE.has(judged.get(l.id).winner));
  const agreeing = decisive.filter((l) => judged.get(l.id).winner === l.winner);
  const humanDecisive = pairs.filter((l) => DECISIVE.has(l.winner));
  const abstained = humanDecisive.filter((l) => !DECISIVE.has(judged.get(l.id).winner));
  const inconsistent = pairs.filter((l) => judged.get(l.id).consistent === false);
  const misses = decisive.filter((l) => judged.get(l.id).winner !== l.winner).map((l) => l.id);

  return {
    pairs: pairs.length,
    bothDecisive: decisive.length,
    agreePct: sharePct(agreeing.length, decisive.length),
    judgeAbstainPct: sharePct(abstained.length, humanDecisive.length),
    positionFlipPct: sharePct(inconsistent.length, pairs.length),
    misses,
  };
}
