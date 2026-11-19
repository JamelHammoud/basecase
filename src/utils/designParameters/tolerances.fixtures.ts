import { box } from '../../sim/fixtures/parts';
import type { DimensionalRequirement, DesignParameter } from './types';

export const TOLERANCE_MECHANISMS = [
  ['Bearing-seat clearance', 22.1, 22, -0.08, 0.04, -0.02, 0.03],
  ['Shaft and bore fit', 8.1, 8, -0.04, 0.02, -0.01, 0.08],
  ['Screw clearance', 3.4, 3, -0.1, 0.1, -0.05, 0.05],
  ['Spacer-stack end play', 30.3, 30, -0.1, 0.2, -0.05, 0.25],
  ['Servo-pocket width', 20.2, 20, -0.15, 0.1, -0.05, 0.1],
  ['Enclosure-lip clearance', 50.2, 50, -0.2, 0.05, -0.1, 0.1],
  ['Sliding-rail gap', 12.3, 12, -0.1, 0.1, -0.1, 0.15],
  ['Keyed-hub width', 6.1, 6, -0.08, 0.03, -0.02, 0.05],
  ['Paired mounting-hole spacing', 40.2, 40, -0.1, 0.1, -0.1, 0.15],
  ['Gripper-jaw opening', 60.3, 60, -0.2, 0.1, -0.1, 0.15],
] as const;

export function toleranceFixture(index = 3) {
  const [name, outer, inner, lowerA, upperA, lowerB, upperB] = TOLERANCE_MECHANISMS[index];
  const parameters: DesignParameter[] = [
    { name: 'outer', unit: 'mm', value: outer, tolerance: { lower: lowerA, upper: upperA } },
    { name: 'inner', unit: 'mm', value: inner, tolerance: { lower: lowerB, upper: upperB } },
  ];
  const parts = [outer, inner].map((width, i) => ({
    ...box(i ? 'spacer' : 'frame', [0, i * 20, 0], [width, 4, 6], 10),
    rotation: [0, index * 9, 0] as [number, number, number],
    dimensionBindings: [
      { kind: 'primitive' as const, target: 'width', unit: 'mm' as const, expression: i ? 'inner' : 'outer' },
    ],
  }));
  const requirements: DimensionalRequirement[] = [
    {
      name: 'clearance',
      expression: 'outer - inner',
      minimum: 0,
      maximum: 1,
      dimensions: parts.map((part, i) => ({
        part: part.id,
        kind: 'primitive',
        target: 'width',
        parameter: i ? 'inner' : 'outer',
      })),
    },
  ];

  return { parts, parameters, requirements, name };
}
