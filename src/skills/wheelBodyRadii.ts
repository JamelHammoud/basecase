interface WheelGeometry {
  nbody: number;
  ngeom: number;
  geom_bodyid: ArrayLike<number>;
  geom_size: ArrayLike<number>;
}

export function wheelBodyRadii(model: WheelGeometry): Float64Array {
  const radii = new Float64Array(model.nbody).fill(0.001);
  const bodies = model.geom_bodyid;
  const sizes = model.geom_size;

  for (let g = 0; g < model.ngeom; g++) {
    const body = bodies[g];
    const offset = g * 3;

    radii[body] = Math.max(radii[body], sizes[offset], sizes[offset + 1], sizes[offset + 2]);
  }

  return radii;
}
