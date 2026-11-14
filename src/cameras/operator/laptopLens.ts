export const LAPTOP_HFOV_DEG = 70;
export const LAPTOP_ASPECT = 4 / 3;

const DEG = Math.PI / 180;

export const LAPTOP_FOCAL = LAPTOP_ASPECT / 2 / Math.tan((LAPTOP_HFOV_DEG * DEG) / 2);

export type ImageOffset = [x: number, y: number];

export function bearingOf([x, y]: ImageOffset): [right: number, up: number] {
  return [Math.atan((x * LAPTOP_ASPECT) / LAPTOP_FOCAL) / DEG, Math.atan(-y / LAPTOP_FOCAL) / DEG];
}
