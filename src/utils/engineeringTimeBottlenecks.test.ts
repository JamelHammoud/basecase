import { describe, expect, it } from 'vitest';
import { resolvePrinter } from '../data/printers';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { buildTime } from './engineeringTime';
import { reportFromShapes } from './printReport';

const project = { ...DEFAULT_PROJECT, joints: [] };
const empty = reportFromShapes([], { project, printer: resolvePrinter('default', []) });
const base = fixtureRobots()[0].parts[0];
const parts: ScenePart[] = Array.from({ length: 80 }, (_, i) => ({
  ...base,
  id: `part-${i}`,
  kind: i % 3 ? 'box' : 'hardware',
  hardware: { type: 'socket_head', size: 'M3', length: 6 },
  visible: true,
  role: 'solid',
}));

function timeInput(hours: number[], seed = 0) {
  const plates = hours.map((value, i) => ({
    number: i + 1,
    local: i + 1,
    material: 'PLA' as const,
    items: [],
    grams: 10,
    hours: value,
    hash: `plate-${i}`,
  }));
  const assemblySteps = Array.from({ length: hours.length }, (_, step) =>
    Array.from({ length: (step * 7 + seed) % 9 }, (_, i) => parts[(step * 3 + i) % parts.length].id),
  );

  return { parts, project, print: { ...empty, plan: { ...empty.plan, plates } }, assemblySteps };
}

function compareSelection(input: ReturnType<typeof timeInput>) {
  const before = structuredClone(input);
  const result = buildTime(input);
  const ordered = [...input.print.plan.plates].sort((a, b) => b.hours - a.hours);
  const plate = ordered[0];
  const step = [...result.steps].sort((a, b) => b.fasteners - a.fasteners || b.minutes - a.minutes)[0];

  expect(result.longest).toEqual(
    plate ? { number: plate.number, hours: plate.hours, estimated: plate.hours, ids: [] } : undefined,
  );
  expect(result.mostFasteners).toBe(step);
  expect(input).toEqual(before);

  return result;
}

describe('build time bottlenecks', () => {
  it('preserves sorted selection through generated orders, ties, empty lists and edits', () => {
    for (let seed = 0; seed < 100; seed++) {
      const hours = Array.from({ length: seed % 81 }, (_, i) => ((i * 37 + seed) % 19) / 4);
      const input = timeInput(hours, seed);
      const result = compareSelection(input);

      const retained = structuredClone(result);

      input.print.plan.plates.reverse();
      input.assemblySteps.reverse();
      compareSelection(input);
      expect(result).toEqual(retained);
    }
  });

  it('keeps exceptional plate ordering and the first equal duration', () => {
    const orders = [
      [0, -0, 0],
      [Infinity, Infinity, 3],
      [-Infinity, -Infinity],
      [2, NaN, 8],
      [NaN, 9, 1],
    ];

    for (const hours of orders) compareSelection(timeInput(hours));

    expect(compareSelection(timeInput([3, 3, 1])).longest?.number).toBe(1);
  });

  it('ranks current sliced durations and breaks fastener ties by assembly minutes', () => {
    const input = timeInput([8, 4, 1]);
    const assemblySteps = [['part-0'], ['part-3', 'part-1'], ['part-6', 'part-2']];
    const result = buildTime({
      ...input,
      assemblySteps,
      slices: [{ number: 1, hash: 'plate-0', seconds: 0 }],
    });

    expect(result.longest?.number).toBe(2);
    expect(result.mostFasteners).toBe(result.steps[1]);
    expect(result.mostFasteners?.fasteners).toBe(1);
    expect(result.mostFasteners?.minutes).toBe(3.5);
  });
});
