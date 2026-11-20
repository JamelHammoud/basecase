import type { SimModel } from './mjcfTypes';

export function rootPositions(
  model: SimModel | null,
  poses: Float64Array | null,
): Record<string, [number, number, number]> {
  if (!model || !poses) return {};

  return Object.fromEntries(
    model.robots.flatMap((robot) => {
      const index = model.bodies.findIndex((body) => body.name === robot.root);

      if (index < 0 || poses.length < index * 7 + 3) return [];

      const offset = index * 7;

      return [[robot.key, [poses[offset], poses[offset + 1], poses[offset + 2]]]];
    }),
  );
}
