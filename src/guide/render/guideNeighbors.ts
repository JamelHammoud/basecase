export const GUIDE_NEIGHBORS = `
  for (int k = 0; k < neighborCount; k++) {
    int r = k < 8 ? 1 : 2;
    {
      if (ink == 1.0) break;

      vec2 uv = vUv + neighbors[k] * texel;
`;

export const GUIDE_DIRECTIONS = `
uniform int neighborCount;
uniform vec2 neighbors[12];
`;

export const GUIDE_OFFSETS = [
  [1, 0],
  [0.70710678, 0.70710678],
  [0, 1],
  [-0.70710678, 0.70710678],
  [-1, 0],
  [-0.70710678, -0.70710678],
  [0, -1],
  [0.70710678, -0.70710678],
  [2, 0],
  [0, 2],
  [-2, 0],
  [0, -2],
];
