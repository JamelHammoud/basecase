export interface OneEuroOptions {
  minCutoff: number;
  beta: number;
  dCutoff?: number;
}

export interface OneEuro {
  filter: (values: ArrayLike<number>, t: number) => Float64Array;
  reset: () => void;
}

const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export function oneEuro({ minCutoff, beta, dCutoff = 1 }: OneEuroOptions): OneEuro {
  let last: Float64Array | null = null;
  let speed: Float64Array | null = null;
  let lastT = 0;

  const start = (values: ArrayLike<number>, t: number) => {
    last = Float64Array.from(values);
    speed = new Float64Array(values.length);
    lastT = t;

    return last.slice();
  };

  return {
    reset: () => {
      last = null;
      speed = null;
    },
    filter: (values, t) => {
      const dt = t - lastT;

      if (!last || !speed || last.length !== values.length || dt <= 0) return start(values, t);

      const out = new Float64Array(values.length);
      const ad = alpha(dCutoff, dt);

      for (let i = 0; i < values.length; i++) {
        speed[i] += ad * ((values[i] - last[i]) / dt - speed[i]);
        out[i] = last[i] + alpha(minCutoff + beta * Math.abs(speed[i]), dt) * (values[i] - last[i]);
      }

      last = out;
      lastT = t;

      return out.slice();
    },
  };
}
