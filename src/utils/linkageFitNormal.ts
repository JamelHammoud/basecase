const dot = (a: Float64Array, b: ArrayLike<number>) => {
  let s = 0;

  for (let i = 0; i < a.length; i++) s += a[i] * b[i];

  return s;
};

function eliminate(m: Float64Array, n: number, col: number): boolean {
  const width = n + 1;
  let pivot = col;

  for (let row = col + 1; row < n; row++)
    if (Math.abs(m[row * width + col]) > Math.abs(m[pivot * width + col])) pivot = row;

  if (Math.abs(m[pivot * width + col]) < 1e-300) return false;

  for (let k = 0; k < width && pivot !== col; k++) {
    const t = m[col * width + k];

    m[col * width + k] = m[pivot * width + k];
    m[pivot * width + k] = t;
  }

  for (let row = col + 1; row < n; row++) {
    const f = m[row * width + col] / m[col * width + col];

    for (let k = col; k < width; k++) m[row * width + k] -= f * m[col * width + k];
  }

  return true;
}

function solveLinear(m: Float64Array, n: number): Float64Array | null {
  const width = n + 1;

  for (let col = 0; col < n; col++) if (!eliminate(m, n, col)) return null;

  const out = new Float64Array(n);

  for (let row = n - 1; row >= 0; row--) {
    let s = m[row * width + n];

    for (let k = row + 1; k < n; k++) s -= m[row * width + k] * out[k];

    out[row] = s / m[row * width + row];
  }

  return out;
}

function normalEquations(columns: Float64Array[], r: number[]): Float64Array {
  const n = columns.length;
  const width = n + 1;
  const m = new Float64Array(n * width);

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const v = dot(columns[i], columns[j]);

      m[i * width + j] = v;
      m[j * width + i] = v;
    }

    m[i * width + n] = -dot(columns[i], r);
  }

  return m;
}

export function prepareNormalStep(columns: Float64Array[], residuals: number[]) {
  const n = columns.length;
  const normal = normalEquations(columns, residuals);

  return (lambda: number): Float64Array | null => {
    const damped = normal.slice();

    for (let i = 0; i < n; i++) {
      const diagonal = i * (n + 1) + i;

      damped[diagonal] += lambda * (damped[diagonal] + 1e-9);
    }

    return solveLinear(damped, n);
  };
}
