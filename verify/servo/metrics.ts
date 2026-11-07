export interface FopdFit {
  tau: number;
  delay: number;
  rms: number;
}

export function rms(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;

  for (let i = 0; i < n; i++) sum += (a[i] - b[i]) ** 2;

  return Math.sqrt(sum / Math.max(n, 1));
}

function shifted(command: ArrayLike<number>, at: number): number {
  const clamped = Math.max(0, at);
  const index = Math.floor(clamped);

  if (index + 1 >= command.length) return command[command.length - 1];

  const frac = clamped - index;

  return command[index] * (1 - frac) + command[index + 1] * frac;
}

export function fopdResponse(
  command: ArrayLike<number>,
  start: number,
  fit: { tau: number; delay: number; dt: number },
): Float64Array {
  const out = new Float64Array(command.length);
  const alpha = 1 - Math.exp(-fit.dt / fit.tau);
  const lag = fit.delay / fit.dt;
  let y = start;

  for (let k = 0; k < command.length; k++) {
    out[k] = y;
    y += alpha * (shifted(command, k - lag) - y);
  }

  return out;
}

function errorOf(
  command: ArrayLike<number>,
  target: ArrayLike<number>,
  fit: { tau: number; delay: number; dt: number },
) {
  return rms(fopdResponse(command, target[0], fit), target);
}

function bestOnGrid(
  command: ArrayLike<number>,
  target: ArrayLike<number>,
  grid: { dt: number; taus: number[]; delays: number[] },
): FopdFit {
  let best: FopdFit = { tau: grid.taus[0], delay: grid.delays[0], rms: Infinity };

  for (const tau of grid.taus) {
    for (const delay of grid.delays) {
      const e = errorOf(command, target, { tau, delay, dt: grid.dt });

      if (e < best.rms) best = { tau, delay, rms: e };
    }
  }

  return best;
}

const span = (from: number, to: number, count: number) =>
  Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));

export function fitFopd(command: ArrayLike<number>, target: ArrayLike<number>, dt: number): FopdFit {
  const coarse = bestOnGrid(command, target, {
    dt,
    taus: span(Math.log(0.002), Math.log(1), 40).map(Math.exp),
    delays: span(0, 0.15, 31),
  });
  const fine = bestOnGrid(command, target, {
    dt,
    taus: span(coarse.tau * 0.8, coarse.tau * 1.25, 21),
    delays: span(Math.max(0, coarse.delay - 0.006), coarse.delay + 0.006, 25),
  });

  return bestOnGrid(command, target, {
    dt,
    taus: span(fine.tau * 0.97, fine.tau * 1.03, 13),
    delays: span(Math.max(0, fine.delay - 0.0006), fine.delay + 0.0006, 13),
  });
}
