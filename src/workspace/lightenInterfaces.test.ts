import { describe, expect, it } from 'vitest';
import { addHoles } from '../agent/cadCode';
import { portsOf, worldPort } from '../agent/ports';
import { hardware, printed } from '../assembly/assembly.fixtures';
import type { ChainResult } from '../assembly/assemblyTypes';
import type { LightenFrozen } from '../strength/lightenTypes';
import type { V3 } from '../strength/types';
import type { MeshMeasure } from '../three/meshMeasure';
import type { Port } from '../types/ports';
import { frozenInterfaces } from './lightenInterfaces';

const measure: MeshMeasure = {
  min: [-30, -40, -50],
  max: [60, 70, 80],
  centroid: [15, 15, 15],
  volumeMm3: 1000,
  areaMm2: 100,
  triangles: 12,
};

const closeVector = (got: V3, wanted: V3) => got.forEach((value, axis) => expect(value).toBeCloseTo(wanted[axis], 6));

function lineThrough(regions: LightenFrozen, point: V3, radius: number) {
  const line = regions.lines!.find((candidate) => Math.abs(candidate.radius - radius) < 1e-6)!;
  const d = line.to.map((value, axis) => value - line.from[axis]);
  const v = point.map((value, axis) => value - line.from[axis]);
  const cross = [v[1] * d[2] - v[2] * d[1], v[2] * d[0] - v[0] * d[2], v[0] * d[1] - v[1] * d[0]];

  expect(Math.hypot(...cross)).toBeCloseTo(0, 6);
  expect(Math.hypot(...d)).toBeGreaterThan(80);
}

describe('Lighten interfaces', () => {
  it('keeps unused bores, full mating faces, and unrelated screw seats in world coordinates', () => {
    const part = printed('bracket', { size: [40, 10, 30] }, [10, 20, 30]);

    part.rotation = [20, 35, 55];
    part.cad!.originOffset = [2, 3, 4];
    part.cad!.ports = [
      { name: 'unused bore', position: [7, 8, 9], axis: [0, 0, 1], diameterMm: 8.4, kind: 'bore' },
      { name: 'mount face', position: [2, 5, 4], axis: [0, 1, 0], kind: 'face' },
    ];

    const inbound = {
      ...part,
      id: 'other',
      mates: [{ port: 'mount face', target: part.id, targetPort: 'mount face', type: 'face' as const }],
    };
    const chains: ChainResult = {
      screws: [
        {
          id: 'unrelated screw',
          d: 3,
          axis: [0, 1, 0],
          tip: [6, -2, 8],
          top: [6, 10, 8],
          headR: 5.6,
          stack: [part.id, 'cover'],
          endsIn: { kind: 'nut', id: 'nut' },
          engagementMm: 3,
          needMm: 3,
          problems: [],
        },
      ],
      sleeves: [],
    };
    const regions = frozenInterfaces({ part, parts: [part, inbound], chains, measure });
    const ports = portsOf(part);
    const bore = worldPort(part, ports[0]);
    const face = worldPort(part, ports[1]);

    lineThrough(regions, bore.position, 4.2);
    lineThrough(regions, [6, 0, 8], 5.6);
    expect(regions.planes).toHaveLength(1);
    closeVector(regions.planes![0].point, face.position);
    closeVector(regions.planes![0].normal, face.axis);
    expect(regions.planes![0].halfThickness).toBe(0);
  });

  it.each(['openscad', 'replicad'] as const)(
    'keeps unused %s fasten cuts after rotation and CAD origin offset',
    (language) => {
      const part = printed('bracket', { size: [40, 10, 30] }, [10, 20, 30]);

      part.rotation = [20, 35, 55];
      part.cad!.originOffset = [2, 3, 4];
      part.cad!.language = language;
      part.dimensions = { width: 80, height: 30, depth: 120 };
      part.cad!.code = addHoles(
        language,
        language === 'openscad' ? 'cube(10);' : 'return makeBox([0, 0, 0], [10, 10, 10]);',
        [{ start: [7, 8, 9], direction: [0, 0, 1], diameter: 8.4, length: 20 }],
      );

      const regions = frozenInterfaces({ part, parts: [part], measure });
      const at = worldPort(part, { name: 'cut', position: [10, 18, -48], axis: [0, 1, 0], kind: 'bore' });

      lineThrough(regions, at.position, 16.8);
    },
  );

  it('refuses missing mate and bore dimensions instead of choosing a hole size', () => {
    const part = printed('bracket', { size: [40, 10, 30] }, [0, 0, 0]);
    const port: Port = { name: 'unknown hole', position: [0, 0, 0], axis: [0, 0, 1], kind: 'bore' };

    part.cad!.ports = [port];

    expect(() => frozenInterfaces({ part, parts: [part], measure })).toThrow('measured diameter');

    part.cad!.ports = [];
    part.mates = [{ port: 'deleted port', target: 'other', targetPort: 'face', type: 'face' }];

    expect(() => frozenInterfaces({ part, parts: [part], measure })).toThrow('deleted port');
  });

  it('keeps inbound and outbound face mates even when their local ports are bores', () => {
    const part = printed('bracket', { size: [40, 10, 30] }, [10, 20, 30]);

    part.rotation = [20, 35, 55];
    part.cad!.ports = [
      { name: 'inbound', position: [1, 2, 3], axis: [1, 0, 0], kind: 'bore', diameterMm: 4 },
      { name: 'outbound', position: [4, 5, 6], axis: [0, 1, 0], kind: 'bore', diameterMm: 5 },
    ];
    part.mates = [{ port: 'outbound', target: 'other', targetPort: 'face', type: 'face' }];

    const other = {
      ...part,
      id: 'other',
      mates: [{ port: 'face', target: part.id, targetPort: 'inbound', type: 'face' as const }],
    };
    const regions = frozenInterfaces({ part, parts: [part, other], measure });

    expect(regions.planes).toHaveLength(2);

    for (const port of portsOf(part)) {
      const expected = worldPort(part, port);
      const plane = regions.planes!.find((candidate) =>
        candidate.point.every((value, axis) => Math.abs(value - expected.position[axis]) < 1e-6),
      )!;

      closeVector(plane.normal, expected.axis);
    }
  });

  it('keeps a washer seat wider than the screw head, including its measured radial offset', () => {
    const part = printed('bracket', { size: [40, 10, 30] }, [0, 0, 0]);
    const washer = hardware('washer', { type: 'large_washer', size: 'M3' }, [0.5, 10, 0]);
    const chains: ChainResult = {
      screws: [
        {
          id: 'screw',
          d: 3,
          axis: [0, 1, 0],
          tip: [0, -2, 0],
          top: [0, 14, 0],
          headR: 2.75,
          stack: [part.id],
          endsIn: { kind: 'printed', id: part.id },
          engagementMm: 3,
          needMm: 3,
          problems: [],
        },
      ],
      sleeves: [{ id: washer.id, kind: 'washer', host: part.id, screw: 'screw' }],
    };
    const regions = frozenInterfaces({ part, parts: [part, washer], chains, measure });

    lineThrough(regions, [0, 10, 0], 5);
  });
});
