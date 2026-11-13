import { seededRandom } from './arenaWorld';
import { sha256Hex } from './hash';

export interface CemOptions {
  mean: number[];
  sigma: number[];
  samples: number;
  elites: number;
  iterations: number;
  seed: string;
  score: (x: number[]) => Promise<number>;
  done?: (best: number) => boolean;
  stop?: () => boolean;
}

export interface CemResult {
  best: number[];
  score: number;
  evaluations: number;
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-12);

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

export async function cem(options: CemOptions): Promise<CemResult> {
  const random = seededRandom(sha256Hex(`cem|${options.seed}`));
  let mean = [...options.mean];
  let sigma = [...options.sigma];
  let best = { x: [...mean], score: await options.score(mean) };
  let evaluations = 1;

  for (let it = 0; it < options.iterations; it++) {
    if (options.done?.(best.score) || options.stop?.()) break;

    const batch: Array<{ x: number[]; score: number }> = [{ x: best.x, score: best.score }];

    for (let s = 0; s < options.samples; s++) {
      const x = mean.map((m, i) => m + sigma[i] * gaussian(random));

      batch.push({ x, score: await options.score(x) });
      evaluations += 1;
    }

    batch.sort((a, b) => b.score - a.score);

    if (batch[0].score > best.score) best = batch[0];

    const elite = batch.slice(0, options.elites);

    mean = mean.map((_, i) => elite.reduce((s, e) => s + e.x[i], 0) / elite.length);
    sigma = sigma.map((sg, i) => {
      const spread = Math.sqrt(elite.reduce((s, e) => s + (e.x[i] - mean[i]) ** 2, 0) / elite.length);

      return Math.max(0.1 * sg, 0.5 * sg + 0.5 * spread);
    });
  }

  return { best: best.x, score: best.score, evaluations };
}
