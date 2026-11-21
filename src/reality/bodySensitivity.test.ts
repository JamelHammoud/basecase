import { describe, expect, it } from 'vitest';
import { bodySensitivity, normalizedBodyResponse } from './bodySensitivity';

const column = (...values: number[]) => Float64Array.from(values);

describe('local body parameter directions', () => {
  it('separates distinguishable, negligible and coupled explanations', () => {
    const result = bodySensitivity([
      column(10, 0, 0, 0),
      column(0, 8, 0, 0),
      column(0, 8, 0, 0),
      column(0, 0, 0.01, 0),
    ]);

    expect(result.parameters).toEqual(['distinguishable', 'coupled', 'coupled', 'poor-excitation']);
    expect(result.directions.filter((direction) => direction.distinguishable)).toHaveLength(2);

    const coupled = result.directions.find(
      (direction) => Math.abs(direction.weights[1]) > 0.5 && !direction.distinguishable,
    )!;

    expect(coupled.weights[1] / coupled.weights[2]).toBeCloseTo(-1, 10);
    expect(coupled.response).toBeLessThan(1e-10);
  });

  it('retains independent directions after orthogonal mixing and repeated singular values', () => {
    const result = bodySensitivity([column(6, 6), column(6, -6)]);

    expect(result.parameters).toEqual(['distinguishable', 'distinguishable']);
    result.directions.forEach((direction) => expect(direction.response).toBeCloseTo(6, 12));
  });

  it('keeps parameter-unit rescaling from changing responses, classifications or coupled directions', () => {
    const low = column(0, 0, 0, 0);
    const high = column(0.01, 0.02, 0.03, 0.04);
    const kg = normalizedBodyResponse({ low, high, span: 0.001, scale: 0.1 });
    const grams = normalizedBodyResponse({ low, high, span: 1, scale: 100 });
    const dimensionless = column(4, -4, 4, -4);

    expect(grams).toEqual(kg);
    expect(bodySensitivity([dimensionless, kg, kg])).toEqual(bodySensitivity([dimensionless, kg, grams]));
  });

  it('projects only distinguishable directions and preserves an unexplained residual', () => {
    const result = bodySensitivity([column(10, 0, 0), column(0, 0.001, 0)], column(100, 0, 12));

    expect(result.parameters).toEqual(['distinguishable', 'poor-excitation']);
    expect(result.outsideSupportedDirections).toBeCloseTo(12 / Math.sqrt(3), 12);
    expect(bodySensitivity([column(10, 0)], column(100, 0)).outsideSupportedDirections).toBeCloseTo(0, 12);
  });

  it('makes reported directions agree with independently applied multi-parameter responses', () => {
    const columns = [column(10, 2, 3, 5), column(0, 4, 9, 2), column(10, 6, 12, 7)];
    const result = bodySensitivity(columns);

    for (const direction of result.directions) {
      const combined = Float64Array.from(columns[0], (_, row) =>
        columns.reduce((sum, values, index) => sum + direction.weights[index] * values[row], 0),
      );
      const response = Math.sqrt(combined.reduce((sum, value) => sum + value * value, 0) / combined.length);

      expect(direction.response).toBeCloseTo(response, 10);
      expect(direction.weights.reduce((sum, value) => sum + value * value, 0)).toBeCloseTo(1, 12);
    }

    expect(result.directions.filter((direction) => direction.response < 1e-8)).toHaveLength(1);
  });

  it('refuses nonfinite, oversized and inconsistent matrices', () => {
    for (const columns of [[column(NaN)], [column(Infinity)], [column(1e308)], [column(1), column(1, 2)], []]) {
      expect(() => bodySensitivity(columns)).toThrow();
    }

    expect(() => bodySensitivity(Array.from({ length: 25 }, () => column(1)))).toThrow();
    expect(() => bodySensitivity([column(10, 0)], column(1e308, 1e308))).toThrow();
  });
});
