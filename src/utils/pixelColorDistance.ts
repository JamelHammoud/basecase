export function pixelColorDistanceSquared(
  data: Uint8ClampedArray,
  offset: number,
  background: readonly number[],
): number {
  const r = data[offset] - background[0];
  const g = data[offset + 1] - background[1];
  const b = data[offset + 2] - background[2];

  return r * r + g * g + b * b;
}
