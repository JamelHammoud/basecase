import { either, stay, walk, except, type Workflow } from './scripts';
import type { Line, Point, Zone } from '../types';

const rect = (left: number, top: number, right: number, bottom: number): Point[] => [
  [left, top],
  [right, top],
  [right, bottom],
  [left, bottom],
];

const upward: Line = { name: 'gate', from: [0.5, 1], to: [0.5, 0] };
const across = (name: string, label?: string): Line => ({ name, from: [0, 0.5], to: [1, 0.5], label });
const zone = (name: string, points: Point[], label?: string): Zone => ({ name, points, label });
const none = { zones: [], lines: [] };

const conveyor = (): Workflow => ({
  id: 'conveyor part counting',
  seconds: 12,
  fps: 5,
  classes: ['block'],
  objects: [0, 1, 2, 3].map((part) => ({
    label: 'block',
    size: [0.08, 0.08] as [number, number],
    at: walk([0.05, 0.5], [0.95, 0.5], part * 2.5, part * 2.5 + 4.5),
  })),
  regions: { zones: [], lines: [{ ...upward, label: 'block' }] },
  expect: { crossings: { gate: [4, 0] } },
});

const doorway = (): Workflow => ({
  id: 'doorway entry and exit',
  seconds: 13,
  fps: 5,
  classes: ['person'],
  objects: [
    {
      label: 'person',
      size: [0.12, 0.25],
      at: either(walk([0.3, 0.2], [0.3, 0.8], 1, 3), stay([0.3, 0.8], 3, 10)),
    },
    { label: 'person', size: [0.12, 0.25], at: walk([0.7, 0.9], [0.7, 0.2], 4, 7) },
  ],
  regions: { zones: [zone('hall', rect(0, 0.5, 1, 1), 'person')], lines: [across('door', 'person')] },
  expect: { crossings: { door: [1, 1] }, zonePeak: { hall: 2 }, zoneEnd: { hall: 0 } },
});

const bin = (): Workflow => ({
  id: 'bin occupancy',
  seconds: 12,
  fps: 5,
  classes: ['block'],
  objects: [
    {
      label: 'block',
      size: [0.08, 0.08],
      at: either(walk([0.2, 0.7], [0.75, 0.7], 0, 2), stay([0.75, 0.7], 2, 6), walk([0.75, 0.7], [0.75, 0.05], 6, 7.5)),
    },
  ],
  regions: { zones: [zone('bin', rect(0.6, 0.5, 0.9, 0.9), 'block')], lines: [] },
  expect: { zonePeak: { bin: 1 }, zoneEnd: { bin: 0 } },
});

const pick = (): Workflow => ({
  id: 'arm pick-zone occupancy',
  seconds: 12,
  fps: 5,
  classes: ['block'],
  objects: [{ label: 'block', size: [0.08, 0.08], at: either(stay([0.4, 0.6], 1, 4), stay([0.4, 0.6], 8, 12)) }],
  regions: { zones: [zone('pick', rect(0.3, 0.5, 0.5, 0.7), 'block')], lines: [] },
  expect: { zonePeak: { pick: 1 }, zoneEnd: { pick: 1 } },
});

const lane = (): Workflow => ({
  id: 'rover lane blocking',
  seconds: 10,
  fps: 5,
  classes: ['obstacle', 'cone'],
  objects: [
    { label: 'obstacle', size: [0.15, 0.15], at: stay([0.5, 0.5], 3, 10) },
    { label: 'cone', size: [0.1, 0.1], at: stay([0.1, 0.5], 0, 10) },
  ],
  regions: { zones: [zone('lane', rect(0.35, 0, 0.65, 1), 'obstacle')], lines: [] },
  expect: { zonePeak: { lane: 1 }, zoneEnd: { lane: 1 } },
});

const crossing = (): Workflow => ({
  id: 'two crossing people',
  seconds: 8,
  fps: 5,
  classes: ['person'],
  objects: [
    { label: 'person', size: [0.1, 0.25], at: walk([0.1, 0.3], [0.9, 0.3], 0, 8) },
    { label: 'person', size: [0.1, 0.25], at: walk([0.9, 0.65], [0.1, 0.65], 0, 8) },
  ],
  regions: { zones: [], lines: [{ ...upward, label: 'person' }] },
  expect: { crossings: { gate: [1, 1] } },
});

const occluded = (): Workflow => ({
  id: 'a briefly occluded object',
  seconds: 8,
  fps: 5,
  classes: ['block'],
  objects: [{ label: 'block', size: [0.08, 0.08], at: except(walk([0.1, 0.5], [0.9, 0.5], 0, 8), [3.5, 4.5]) }],
  regions: { zones: [], lines: [{ ...upward, label: 'block' }] },
  expect: { crossings: { gate: [1, 0] }, objectIds: [[1]] },
});

const returns = (): Workflow => ({
  id: 'an object that leaves and returns',
  seconds: 12,
  fps: 5,
  classes: ['block'],
  objects: [{ label: 'block', size: [0.08, 0.08], at: either(stay([0.3, 0.5], 0, 3), stay([0.3, 0.5], 7, 12)) }],
  regions: { zones: [zone('shelf', rect(0.2, 0.4, 0.4, 0.6), 'block')], lines: [] },
  expect: { objectIds: [[1, 2]], zonePeak: { shelf: 1 }, zoneEnd: { shelf: 1 } },
});

const drawer = (): Workflow => ({
  id: 'a drawer past a line',
  seconds: 10,
  fps: 5,
  classes: ['drawer'],
  objects: [
    {
      label: 'drawer',
      size: [0.4, 0.1],
      at: either(stay([0.5, 0.3], 0, 1), walk([0.5, 0.3], [0.5, 0.8], 1, 4), stay([0.5, 0.8], 4, 10)),
    },
  ],
  regions: { zones: [zone('open', rect(0, 0.55, 1, 1), 'drawer')], lines: [across('front', 'drawer')] },
  expect: { crossings: { front: [1, 0] }, zoneEnd: { open: 1 } },
});

const flicker = (): Workflow => ({
  id: 'detector flicker',
  seconds: 8,
  fps: 10,
  classes: ['block'],
  objects: [
    {
      label: 'block',
      size: [0.08, 0.08],
      at: except(walk([0.1, 0.5], [0.9, 0.5], 0, 8), [2.0, 2.1], [3.7, 4.1], [4.5, 4.6], [5.9, 6.0]),
    },
  ],
  regions: { zones: [], lines: [{ ...upward, label: 'block' }] },
  expect: { crossings: { gate: [1, 0] }, objectIds: [[1]] },
});

const idle = (): Workflow => ({
  id: 'nothing crosses',
  seconds: 6,
  fps: 5,
  classes: ['block'],
  objects: [
    { label: 'block', size: [0.08, 0.08], at: walk([0.2, 0.2], [0.2, 0.8], 0, 6) },
    { label: 'block', size: [0.08, 0.08], at: (second) => [0.5 + (Math.round(second * 5) % 2 ? 0.001 : -0.001), 0.5] },
  ],
  regions: { zones: [], lines: [{ ...upward, label: 'block' }] },
  expect: { crossings: { gate: [0, 0] } },
});

const wrongClass = (): Workflow => ({
  id: 'a detection of the wrong class',
  seconds: 8,
  fps: 5,
  classes: ['block', 'person'],
  objects: [{ label: 'person', size: [0.1, 0.25], at: walk([0.1, 0.5], [0.9, 0.5], 0, 8) }],
  regions: { zones: [zone('bin', rect(0.4, 0.3, 0.6, 0.7), 'block')], lines: [{ ...upward, label: 'block' }] },
  expect: { crossings: { gate: [0, 0] }, zonePeak: { bin: 0 }, zoneEnd: { bin: 0 } },
});

export const WORKFLOWS: Workflow[] = [
  conveyor(),
  doorway(),
  bin(),
  pick(),
  lane(),
  crossing(),
  occluded(),
  returns(),
  drawer(),
  flicker(),
  idle(),
  wrongClass(),
];

export const NO_REGIONS = none;
