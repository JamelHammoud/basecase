import type { Rect } from './bed';

const EPS = 1e-6;

const fits = (w: number, d: number, width: number, depth: number) => !(w > width + EPS || d > depth + EPS);

function placement(rect: Rect, width: number, depth: number, yaw: number) {
  return { rect: { x: rect.x, y: rect.y, w: width, d: depth }, yaw };
}

export function packSpot(free: Rect[], w: number, d: number) {
  let straight: Rect | null = null;
  let rotated: Rect | null = null;
  let straightScore = 0;
  let rotatedScore = 0;

  for (const rect of free) {
    const { x, y, w: width, d: depth } = rect;
    const straightFits = fits(w, d, width, depth);
    const rotatedFits = fits(d, w, width, depth);
    const score = straightFits ? Math.min(width - w, depth - d) * 1e6 + y * 1e3 + x : 0;
    const turnedScore = rotatedFits ? Math.min(width - d, depth - w) * 1e6 + y * 1e3 + x : 0;

    if (straightFits && (!straight || score < straightScore)) {
      straight = rect;
      straightScore = score;
    }

    if (rotatedFits && (!rotated || turnedScore < rotatedScore)) {
      rotated = rect;
      rotatedScore = turnedScore;
    }
  }

  if (rotated && (!straight || rotatedScore < straightScore)) return placement(rotated, d, w, 90);

  if (!straight) return null;

  return placement(straight, w, d, 0);
}
