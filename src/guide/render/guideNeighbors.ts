export const GUIDE_NEIGHBORS = `
  for (int r = 1; r <= 2; r++) {
    for (int k = 0; k < 8; k++) {
      if (r == 2 && (k == 1 || k == 3 || k == 5 || k == 7)) continue;

      vec2 uv = vUv + neighbor(k) * texel * float(r);
`;

export const GUIDE_DIRECTIONS = `
vec2 neighbor(int k) {
  if (k == 0) return vec2(1.0, 0.0);
  if (k == 1) return vec2(0.70710678, 0.70710678);
  if (k == 2) return vec2(0.0, 1.0);
  if (k == 3) return vec2(-0.70710678, 0.70710678);
  if (k == 4) return vec2(-1.0, 0.0);
  if (k == 5) return vec2(-0.70710678, -0.70710678);
  if (k == 6) return vec2(0.0, -1.0);
  return vec2(0.70710678, -0.70710678);
}
`;
