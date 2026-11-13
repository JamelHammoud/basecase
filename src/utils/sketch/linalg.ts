export type Matrix = number[][];

const swapRows = (m: Matrix, i: number, j: number) => {
  const t = m[i];

  m[i] = m[j];
  m[j] = t;
};

const pivotRow = (m: Matrix, col: number, from: number) => {
  let best = from;

  for (let r = from + 1; r < m.length; r++) {
    if (Math.abs(m[r][col]) > Math.abs(m[best][col])) best = r;
  }

  return best;
};

const eliminateBelow = (m: Matrix, row: number, col: number, rhs?: number[]) => {
  for (let r = row + 1; r < m.length; r++) {
    const f = m[r][col] / m[row][col];

    if (f === 0) continue;

    for (let c = col; c < m[r].length; c++) m[r][c] -= f * m[row][c];

    if (rhs) rhs[r] -= f * rhs[row];
  }
};

export function solveSquare(matrix: Matrix, rhs: number[]): number[] | null {
  const m = matrix.map((row) => [...row]);
  const b = [...rhs];
  const n = m.length;

  for (let col = 0; col < n; col++) {
    const p = pivotRow(m, col, col);

    if (Math.abs(m[p][col]) < 1e-300) return null;

    swapRows(m, col, p);
    [b[col], b[p]] = [b[p], b[col]];
    eliminateBelow(m, col, col, b);
  }

  const x = new Array<number>(n).fill(0);

  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];

    for (let c = r + 1; c < n; c++) s -= m[r][c] * x[c];

    x[r] = s / m[r][r];
  }

  return x;
}

const maxAbs = (m: Matrix) => m.reduce((best, row) => row.reduce((b, v) => Math.max(b, Math.abs(v)), best), 0);

export function rank(matrix: Matrix, relativeTolerance = 1e-8): number {
  const m = matrix.map((row) => [...row]);
  const cols = m[0]?.length ?? 0;
  const tol = Math.max(maxAbs(m), 1) * relativeTolerance;
  let row = 0;

  for (let col = 0; col < cols && row < m.length; col++) {
    const p = pivotRow(m, col, row);

    if (Math.abs(m[p][col]) <= tol) continue;

    swapRows(m, row, p);
    eliminateBelow(m, row, col);
    row++;
  }

  return row;
}
