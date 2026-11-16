export const determinant3 = (a: number[][]) =>
  a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
  a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
  a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);

export function solve3(a: number[][], b: number[], determinant = determinant3(a)): [number, number, number] {
  const x =
    b[0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (b[1] * a[2][2] - a[1][2] * b[2]) +
    a[0][2] * (b[1] * a[2][1] - a[1][1] * b[2]);
  const y =
    a[0][0] * (b[1] * a[2][2] - a[1][2] * b[2]) -
    b[0] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * b[2] - b[1] * a[2][0]);
  const z =
    a[0][0] * (a[1][1] * b[2] - b[1] * a[2][1]) -
    a[0][1] * (a[1][0] * b[2] - b[1] * a[2][0]) +
    b[0] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);

  return [x / determinant, y / determinant, z / determinant];
}
