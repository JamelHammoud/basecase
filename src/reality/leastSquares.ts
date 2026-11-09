export interface LeastSquaresProblem {
  residual: (x: number[]) => Float64Array;
  x0: number[];
  lower: number[];
  upper: number[];
  step?: number;
  maxIterations?: number;
}

export interface LeastSquaresResult {
  x: number[];
  cost: number;
  iterations: number;
  evaluations: number;
}

const sumSquares = (r: Float64Array) => r.reduce((s, v) => s + v * v, 0);

export function solveLinear(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);

  for (let col = 0; col < n; col++) {
    const pivot = a
      .slice(col)
      .reduce((best, row, k) => (Math.abs(row[col]) > Math.abs(a[best][col]) ? col + k : best), col);

    if (Math.abs(a[pivot][col]) < 1e-300) return null;

    [a[col], a[pivot]] = [a[pivot], a[col]];

    for (let row = col + 1; row < n; row++) {
      const k = a[row][col] / a[col][col];

      for (let c = col; c <= n; c++) a[row][c] -= k * a[col][c];
    }
  }

  const x = new Array<number>(n).fill(0);

  for (let row = n - 1; row >= 0; row--) {
    const tail = a[row].slice(row + 1, n).reduce((s, v, k) => s + v * x[row + 1 + k], 0);

    x[row] = (a[row][n] - tail) / a[row][row];
  }

  return x;
}

const clamp = (x: number[], lower: number[], upper: number[]) =>
  x.map((v, i) => Math.min(upper[i], Math.max(lower[i], v)));

function jacobian(problem: LeastSquaresProblem, x: number[], r: Float64Array): Float64Array[] {
  const h = problem.step ?? 0.03;

  return x.map((v, i) => {
    const dir = v + h <= problem.upper[i] ? h : -h;
    const shifted = [...x];

    shifted[i] = v + dir;

    const rs = problem.residual(shifted);

    return rs.map((value, k) => (value - r[k]) / dir);
  });
}

function normalEquations(columns: Float64Array[], r: Float64Array) {
  const a = columns.map((ci) => columns.map((cj) => ci.reduce((s, v, k) => s + v * cj[k], 0)));
  const g = columns.map((ci) => ci.reduce((s, v, k) => s + v * r[k], 0));

  return { a, g };
}

const damped = (a: number[][], lambda: number) =>
  a.map((row, i) => row.map((v, j) => (i === j ? v + lambda * Math.max(v, 1e-12) : v)));

export function levenbergMarquardt(problem: LeastSquaresProblem): LeastSquaresResult {
  const maxIterations = problem.maxIterations ?? 20;
  let x = clamp(problem.x0, problem.lower, problem.upper);
  let r = problem.residual(x);
  let cost = sumSquares(r);
  let lambda = 1e-2;
  let evaluations = 1;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const columns = jacobian(problem, x, r);
    const { a, g } = normalEquations(columns, r);

    evaluations += x.length;

    const next = improvedStep({ problem, x, a, g, cost, lambda });

    evaluations += next.tries;

    if (!next.accepted) break;

    const gainRatio = (cost - next.cost) / cost;

    ({ x, r, cost, lambda } = { x: next.x, r: next.r, cost: next.cost, lambda: next.lambda });

    if (gainRatio < 1e-4) break;
  }

  return { x, cost, iterations, evaluations };
}

interface StepInput {
  problem: LeastSquaresProblem;
  x: number[];
  a: number[][];
  g: number[];
  cost: number;
  lambda: number;
}

function improvedStep({ problem, x, a, g, cost, lambda: start }: StepInput) {
  let lambda = start;

  for (let tries = 1; tries <= 6; tries++) {
    const delta = solveLinear(
      damped(a, lambda),
      g.map((v) => -v),
    );
    const candidate = delta
      ? clamp(
          x.map((v, i) => v + delta[i]),
          problem.lower,
          problem.upper,
        )
      : x;
    const r = problem.residual(candidate);
    const c = sumSquares(r);

    if (c < cost) return { accepted: true, x: candidate, r, cost: c, lambda: Math.max(lambda / 3, 1e-6), tries };

    lambda *= 5;
  }

  return { accepted: false, x, r: new Float64Array(), cost, lambda, tries: 6 };
}
