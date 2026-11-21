import type { V3 } from './kinematics';

export function gaitBounds(points: V3[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let footY = Infinity;

  for (const point of points) {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    footY = Math.min(footY, point[1]);
  }

  return { footY, spread: maxX - minX, middle: (maxX + minX) / 2 };
}
