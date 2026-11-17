import { describe, expect, it } from 'vitest';
import { electricalGraph } from './electricalGraph';
import type { ElectricalEndpoint, ElectricalFunction, ElectricalPartMap } from './electricalTypes';

const functions: ElectricalFunction[] = ['ground', 'positive', 'data'];
const map: ElectricalPartMap = { componentId: 'test', ports: [], common: functions };

function endpoints(count: number): ElectricalEndpoint[] {
  return Array.from({ length: count }, (_, index) => ({
    reference: `J${index + 1}`,
    partId: 'part',
    componentId: 'test',
    variant: null,
    name: 'Connector',
    port: `port-${index}`,
    map:
      index % 4 === 3
        ? null
        : {
            port: `port-${index}`,
            connector: 'test',
            source: 'https://example.com/pins',
            sourceLocator: 'Pin table',
            pins: functions.slice(0, (index % 3) + 1).map((kind, pin) => ({
              number: String(pin + 1),
              name: kind,
              function: kind,
              direction: 'passive',
            })),
          },
  }));
}

function previousCommon(graph: ReturnType<typeof electricalGraph>, ends: ElectricalEndpoint[], common = functions) {
  for (const kind of common) {
    const matching = ends.flatMap((end) =>
      (end.map?.pins ?? [])
        .filter((pin) => pin.function === kind)
        .map((pin) => ({ reference: end.reference, pin: pin.number })),
    );

    matching.slice(1).forEach((node) => graph.join(matching[0], node));
  }
}

describe('common electrical rails', () => {
  it.each([0, 1, 2, 3, 4, 12, 48])('preserves complete nets and inputs across %i endpoints', (count) => {
    const ends = endpoints(count);
    const before = structuredClone(ends);
    const actual = electricalGraph(ends);
    const previous = electricalGraph(ends);
    const batches = [ends.slice(0, 3), ends.slice(2), [...ends].reverse(), ends];
    const common: ElectricalFunction[] = ['data', 'ground', 'positive', 'ground'];

    for (const graph of [actual, previous]) {
      if (count > 2) graph.join({ reference: 'J1', pin: '1' }, { reference: 'J3', pin: '1' });
    }

    for (const batch of batches) {
      actual.common({ ...map, common }, batch);
      previousCommon(previous, batch, common);
      expect(actual.nets()).toEqual(previous.nets());
    }

    expect(ends).toEqual(before);
    expect(electricalGraph(ends).nets()).toEqual([]);
  });
});
