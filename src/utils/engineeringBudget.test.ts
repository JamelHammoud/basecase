import { describe, expect, it } from 'vitest';
import type { BomLine } from './bomTypes';
import { lineUsd } from './budget';
import { biggestBudgetLines } from './engineeringBudget';

const line = (cost: number | undefined, index: number): BomLine => ({
  key: `component:${index}`,
  category: 'Components',
  name: `Part ${index}`,
  detail: '',
  qty: 1,
  owned: 0,
  toBuy: 1,
  unit: 'pcs',
  partIds: [`part-${index}`],
  urlKind: 'none',
  status: index % 3 === 0 ? 'unchecked' : 'checked',
  lineUsd: cost,
  estUsd: cost,
});

const previous = (lines: BomLine[]) => [...lines].sort((a, b) => lineUsd(b) - lineUsd(a)).slice(0, 3);

describe('budget contributors', () => {
  it('retains stable cost order across prices, estimates, missing prices and later edits', () => {
    const prices = [undefined, 0, -0, -5, 10, 10, 2, Infinity, -Infinity, NaN];

    for (let count = 0; count < 100; count++) {
      const lines = Array.from({ length: count }, (_, index) => line(((index * 73) % 127) - 30, index));
      const snapshot = structuredClone(lines);

      expect(biggestBudgetLines(lines)).toEqual(previous(lines));
      expect(lines).toEqual(snapshot);
      lines.reverse();
      expect(biggestBudgetLines(lines)).toEqual(previous(lines));
    }

    for (const first of prices) {
      for (const second of prices) {
        const lines = [first, 3, second, 10, 10, undefined].map(line);
        const retained = biggestBudgetLines(lines);

        expect(retained).toEqual(previous(lines));
        expect(retained.every((item) => lines.includes(item))).toBe(true);
        lines[0] = line(100, 0);
        expect(biggestBudgetLines(lines)).toEqual(previous(lines));
        expect(retained).not.toContain(lines[0]);
      }
    }
  });

  it('bounds price reads by the three displayed contributors', () => {
    for (const count of [300, 600]) {
      let reads = 0;
      const lines = Array.from({ length: count }, (_, index) => ({
        ...line(0, index),
        status: 'checked' as const,
        get lineUsd() {
          reads++;

          return (index * 73) % 127;
        },
      }));
      const biggest = biggestBudgetLines(lines);

      expect(reads).toBeLessThanOrEqual(4 * count);
      expect(biggest).toEqual(previous(lines));
    }
  });
});
