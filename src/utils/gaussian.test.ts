import { describe, expect, it } from 'vitest';
import { transformed, type Matrix } from './gaussian';
import { seededRandom } from './seededRandom';
import { fitPopulation, servoSpread } from '../reality/population';
import { measuredUnits } from '../reality/population.fixtures';
import { SERVO_PARAMS } from '../reality/servoParams';
import { DYNAMICS_TERMS } from '../sim/servoModel';

const reference = (a: Matrix, covariance: Matrix): Matrix =>
  a.map((ai) => a.map((aj) => ai.reduce((s, x, p) => s + x * aj.reduce((t, y, q) => t + covariance[p][q] * y, 0), 0)));

function freeze(matrix: Matrix): Matrix {
  matrix.forEach(Object.freeze);
  Object.freeze(matrix);

  return matrix;
}

describe('covariance transforms', () => {
  it('matches the previous arithmetic exactly for rectangular transforms and later edits', () => {
    const random = seededRandom('0123456789abcdef0123456789abcdef');
    const value = () => (random() - 0.5) * 100;

    for (let trial = 0; trial < 160; trial++) {
      const columns = trial % 11;
      const rows = trial % 13;
      const a = Array.from({ length: rows }, () => Array.from({ length: columns }, value));
      const covariance = Array.from({ length: columns }, () => Array.from({ length: columns }, value));
      const before = transformed(a, covariance);

      expect(before).toEqual(reference(a, covariance));

      if (rows && columns) a[0][0] = value();

      if (columns) covariance[0][0] = value();

      expect(transformed(a, covariance)).toEqual(reference(a, covariance));
      expect(transformed(freeze(a), freeze(covariance))).toEqual(reference(a, covariance));
      expect(before).not.toBe(a);
    }
  });

  it('preserves nonfinite arithmetic, signed zeros and independent output storage', () => {
    const a = [
      [0, -0],
      [Infinity, 1],
      [NaN, -1],
    ];
    const covariance = [
      [-0, Infinity],
      [1, NaN],
    ];

    expect(transformed(a, covariance)).toEqual(reference(a, covariance));

    const first = transformed(
      [
        [1, 0],
        [0, 1],
      ],
      [
        [2, 3],
        [4, 5],
      ],
    );
    const second = transformed(
      [
        [1, 0],
        [0, 1],
      ],
      [
        [2, 3],
        [4, 5],
      ],
    );

    first[0][0] = 99;

    expect(second).toEqual([
      [2, 3],
      [4, 5],
    ]);
    expect(first[1]).toEqual([4, 5]);
    expect(transformed([[-0]], [[-0]])).toEqual(reference([[-0]], [[-0]]));
  });

  it.each([6, 12])('reads covariance entries once per output row with %i rows', (rows) => {
    const columns = 7;
    const a = Array.from({ length: rows }, () => new Array<number>(columns).fill(1));
    let reads = 0;
    const covariance = Array.from({ length: columns }, () =>
      Array.from({ length: columns }, (_, column) => column + 1),
    );
    const input = covariance.map((row) => {
      const counted = [...row];

      row.forEach((value, index) =>
        Object.defineProperty(counted, index, {
          get: () => {
            reads++;

            return value;
          },
        }),
      );

      return counted;
    });

    expect(transformed(a, input)).toEqual(reference(a, covariance));
    expect(reads).toBe(rows * columns * columns);
  });

  it('retains the complete servo spread including combined friction covariance', () => {
    const population = fitPopulation(measuredUnits(24))!;
    const terms: Record<string, Record<string, number>> = {
      kp: { gain: 1 },
      damping: { damping: 1 },
      armature: { armature: 1 },
      frictionloss: { friction: 0.5, loadFriction: 0.5 },
      forceNm: { force: 1 },
      delayS: { delay: 1 },
    };
    const a = DYNAMICS_TERMS.map((term) => SERVO_PARAMS.map((param) => terms[term][param] ?? 0));
    const spread = servoSpread(population, ['left', 'right']);

    expect(spread.covariance).toEqual(reference(a, population.covariance));
    expect(spread.joints).toEqual(['left', 'right']);
    expect(spread.servo).toBe('feetech-sts3215 c001 at 7.4 V');
  });
});
