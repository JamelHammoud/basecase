import { fourBarPose, placed, type LinkageSolution, type Vec2 } from '../utils/linkage';
import { couplerCurve } from '../utils/linkage';

export interface LinkageFrame {
  bars: Vec2[];
  plate: Vec2[];
  point: Vec2;
}

export function linkageFrame(solution: LinkageSolution, theta: number): LinkageFrame | null {
  const l = solution.linkage;
  const pose = fourBarPose(l, theta);

  if (!pose) return null;

  const [a, b, c, d, p] = [[0, 0] as Vec2, pose.b, pose.c, [l.ground, 0] as Vec2, pose.p].map((v) => placed(l, v));

  return { bars: [a, b, c, d, a], plate: [b, c, p, b], point: p };
}

export function linkageFrames(solution: LinkageSolution, steps: number): LinkageFrame[] {
  const [from, to] = solution.crank;
  const there = Array.from({ length: steps + 1 }, (_, i) => linkageFrame(solution, from + ((to - from) * i) / steps));
  const frames = there.filter((f): f is LinkageFrame => !!f);

  return [...frames, ...frames.slice(1, -1).reverse()];
}

export const tracedPath = (solution: LinkageSolution, samples: number): Vec2[] =>
  couplerCurve(solution.linkage, solution.crank[0], solution.crank[1], samples);

export function resampled(stroke: Vec2[], count: number): Vec2[] {
  if (stroke.length <= count) return stroke;

  const lengths = [0];

  for (let i = 1; i < stroke.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]));
  }

  const total = lengths[lengths.length - 1];
  let k = 1;

  return Array.from({ length: count }, (_, i) => {
    const want = (total * i) / (count - 1);

    while (k < stroke.length - 1 && lengths[k] < want) k++;

    const span = lengths[k] - lengths[k - 1] || 1;
    const t = Math.min(1, Math.max(0, (want - lengths[k - 1]) / span));

    return [
      stroke[k - 1][0] + (stroke[k][0] - stroke[k - 1][0]) * t,
      stroke[k - 1][1] + (stroke[k][1] - stroke[k - 1][1]) * t,
    ];
  });
}
