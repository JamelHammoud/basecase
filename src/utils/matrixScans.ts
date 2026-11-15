export function pivotRow(matrix: readonly (readonly number[])[], column: number, from = column): number {
  let best = from;

  for (let row = from + 1; row < matrix.length; row++) {
    if (Math.abs(matrix[row][column]) > Math.abs(matrix[best][column])) best = row;
  }

  return best;
}

export function solvedTail(row: readonly number[], solution: readonly number[], from: number): number {
  let sum = 0;

  for (let column = from; column < solution.length; column++) sum += row[column] * solution[column];

  return sum;
}
