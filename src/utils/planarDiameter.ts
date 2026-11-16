export function planarDiameter(points: readonly (readonly number[])[]): number {
  let diameter = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];

    for (let j = i; j < points.length; j++) {
      const b = points[j];

      diameter = Math.max(diameter, Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
  }

  return diameter;
}
