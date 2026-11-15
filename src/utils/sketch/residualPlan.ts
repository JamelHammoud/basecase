import type { Matrix } from './linalg';
import { arcResiduals, constraintResiduals, type Geometry } from './residuals';
import type { SketchArc, SketchConstraint } from './types';

interface ResidualTerm {
  row: number;
  evaluate: (geometry: Geometry) => number[];
}

interface ResidualPlan {
  rows: number;
  terms: ResidualTerm[];
  columns: ResidualTerm[][];
}

interface ResidualInput {
  geometry: Geometry;
  arcs: SketchArc[];
  constraints: SketchConstraint[];
  index: Map<string, number>;
  size: number;
}

const STEP = 1e-7;

function trackedGeometry(input: ResidualInput, dependencies: Set<number>): Geometry {
  const track = (id: string, width: number) => {
    const start = input.index.get(id);

    if (start === undefined) return;

    for (let offset = 0; offset < width; offset++) dependencies.add(start + offset);
  };

  return {
    point: (id) => {
      track(id, 2);

      return input.geometry.point(id);
    },
    radius: (circle) => {
      track(circle.id, 1);

      return input.geometry.radius(circle);
    },
    entity: input.geometry.entity,
  };
}

export function prepareResidualPlan(input: ResidualInput): ResidualPlan {
  const dependencies = new Set<number>();
  const geometry = trackedGeometry(input, dependencies);
  const plan: ResidualPlan = { rows: 0, terms: [], columns: Array.from({ length: input.size }, () => []) };
  const append = (evaluate: ResidualTerm['evaluate']) => {
    dependencies.clear();

    const values = evaluate(geometry);
    const term = { row: plan.rows, evaluate };

    plan.rows += values.length;
    plan.terms.push(term);

    const columns = values.every(Number.isFinite) ? dependencies : plan.columns.keys();

    for (const column of columns) plan.columns[column]?.push(term);
  };

  for (const arc of input.arcs) append((g) => arcResiduals(g, arc));

  for (const constraint of input.constraints) append((g) => constraintResiduals(g, constraint));

  return plan;
}

export function numericJacobian(plan: ResidualPlan, geometryAt: (x: number[]) => Geometry, x: number[]): Matrix {
  const matrix: Matrix = Array.from({ length: plan.rows }, () => new Array<number>(x.length).fill(0));
  const probe = [...x];
  const geometry = geometryAt(probe);

  for (let column = 0; column < x.length; column++) {
    const h = STEP * Math.max(1, Math.abs(x[column]));
    const terms = Number.isFinite(h) ? plan.columns[column] : plan.terms;

    for (const term of terms) {
      probe[column] = x[column] + h;

      const up = term.evaluate(geometry);

      probe[column] = x[column] - h;

      const down = term.evaluate(geometry);

      for (let row = 0; row < up.length; row++) matrix[term.row + row][column] = (up[row] - down[row]) / (2 * h);
    }

    probe[column] = x[column];
  }

  return matrix;
}
