import { surfaceSampleIndex } from '../../utils/surfaceSampleIndex';

const RANDOM_SAMPLES = 40;

function seeded(seed: number) {
  let s = seed >>> 0;

  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;

    return s / 4294967296;
  };
}

export function randomPoints(t: Float32Array): Array<[number, number]> {
  const areas: number[] = [];
  let sum = 0;

  for (let i = 0; i < t.length; i += 6) {
    sum += Math.abs((t[i + 2] - t[i]) * (t[i + 5] - t[i + 1]) - (t[i + 4] - t[i]) * (t[i + 3] - t[i + 1])) / 2;
    areas.push(sum);
  }

  const random = seeded(7);

  return Array.from({ length: RANDOM_SAMPLES }, () => {
    const target = random() * sum;
    const i = surfaceSampleIndex(areas, target) * 6;
    let [u, v] = [random(), random()];

    if (u + v > 1) [u, v] = [1 - u, 1 - v];

    return [
      t[i] + (t[i + 2] - t[i]) * u + (t[i + 4] - t[i]) * v,
      t[i + 1] + (t[i + 3] - t[i + 1]) * u + (t[i + 5] - t[i + 1]) * v,
    ];
  });
}
