import { solveSquare, type Matrix } from './linalg';

function weightedProducts(j: Matrix, weights: number[]) {
  const diagonal = j.map((row) => weights.map((w, c) => row[c] * w * row[c]));
  const matrix = j.map((row, p) =>
    j.map((other, q) => {
      if (p === q) return 0;

      let sum = 0;

      for (let c = 0; c < weights.length; c++) sum += row[c] * weights[c] * other[c];

      return sum;
    }),
  );

  return { matrix, diagonal };
}

export function prepareLeastNorm(j: Matrix, weights: number[], residuals: number[]) {
  const { matrix, diagonal } = weightedProducts(j, weights);

  return (damping: number): number[] | null => {
    const damped = matrix.map((row, p) =>
      row.map((value, q) => (p === q ? diagonal[p].reduce((sum, term) => sum + term, damping) : value)),
    );
    const y = solveSquare(damped, residuals);

    if (!y) return null;

    return weights.map((weight, c) => {
      let sum = 0;

      for (let p = 0; p < j.length; p++) sum += j[p][c] * y[p];

      return -weight * sum;
    });
  };
}
