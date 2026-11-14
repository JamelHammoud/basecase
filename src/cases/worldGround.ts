import type { V3 } from '../utils/kinematics';

export interface PieceBox {
  min: V3;
  max: V3;
}

export const GROUND_STEP_MM = 60;
export const GROUND_INCLINE_DEG = 15;

const NEAR_MM = 100;
const INCLINE = Math.tan((GROUND_INCLINE_DEG * Math.PI) / 180);

const size = ({ min, max }: PieceBox, i: number) => max[i] - min[i];

const flat = (box: PieceBox) => size(box, 1) <= INCLINE * Math.min(size(box, 0), size(box, 2)) + GROUND_STEP_MM;

const near = (a: PieceBox, b: PieceBox) =>
  a.min[0] <= b.max[0] + NEAR_MM &&
  b.min[0] <= a.max[0] + NEAR_MM &&
  a.min[2] <= b.max[2] + NEAR_MM &&
  b.min[2] <= a.max[2] + NEAR_MM;

const stepsFrom = (box: PieceBox, from: PieceBox) => near(box, from) && box.min[1] <= from.max[1] + GROUND_STEP_MM;

export function groundedPieces(boxes: PieceBox[]): boolean[] {
  const ground = boxes.map((b) => flat(b) && b.min[1] <= GROUND_STEP_MM);
  let grew = true;

  while (grew) {
    grew = false;

    boxes.forEach((box, i) => {
      if (ground[i] || !flat(box) || !boxes.some((other, j) => ground[j] && stepsFrom(box, other))) return;

      ground[i] = true;
      grew = true;
    });
  }

  return ground;
}
