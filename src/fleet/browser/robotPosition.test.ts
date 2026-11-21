import { markerPosition } from './mapStage';
import { inventoryPlacement } from './inventoryPlacement';
import { expect, it } from 'vitest';
import { registerControls } from '../sites/registration.mjs';
import { siteControls } from '../sites/siteFixtures';
import { robotPosition } from './robotPosition';
import { arrangeMapLabels } from './mapLabels';
import type { RegistryItem } from './client';

it('keeps stale and elevated positions while refusing replaced facility frames', () => {
  const robot: RegistryItem = {
    id: 'r',
    name: 'Rover',
    parent: 's',
    status: 'online',
    observedAt: '2020-01-01T00:00:00Z',
    stale: true,
    pose: {
      frame: 'facility',
      facility: 'a'.repeat(64),
      pointM: [2, 3, 12],
      floor: 'Level 2',
      quality: 'estimated',
      observedAt: '2020-01-01T00:00:00Z',
    },
    registration: registerControls(siteControls),
    facility: {
      name: 'Hospital',
      hash: 'a'.repeat(64),
      metersPerUnit: 1,
      up: 'Z',
      floors: ['Ground', 'Level 2'],
      sources: [],
    },
  };

  expect(robotPosition(robot)?.altitudeM).toBeCloseTo(32, 2);
  expect(robotPosition(robot)?.floor).toBe('Level 2');
  expect(robotPosition({ ...robot, facility: { ...robot.facility!, hash: 'b'.repeat(64) } })).toBeNull();
  expect(robotPosition({ ...robot, registration: null })).toBeNull();
});

it('separates nearby selectable labels and bounds them to the map', () => {
  const labels = Array.from({ length: 200 }, (_, index) => ({
    id: String(index),
    name: `Robot ${index}`,
    x: 400,
    y: 200,
  }));
  const arranged = arrangeMapLabels(labels, 900, 420);

  expect(new Set(arranged.map((label) => `${label.x},${label.y}`)).size).toBe(arranged.length);
  expect(arranged.every((label) => label.x + 150 <= 900 && label.y + 32 <= 420)).toBe(true);
  expect(arranged[0].anchorX).toBe(400);
});

it('opens the nearest visible ancestor facility without granting robot-only viewers site access', () => {
  const base = { status: 'unknown', observedAt: null, stale: true };
  const robot = { ...base, id: 'robot', name: 'Delivery', parent: 'ward' };
  const hospital = {
    ...base,
    id: 'hospital',
    name: 'Hospital',
    parent: null,
    facility: { name: 'Twin', hash: 'a'.repeat(64) },
  };
  const ward = { ...base, id: 'ward', name: 'Ward', parent: 'hospital' };

  expect(inventoryPlacement([robot], [hospital, ward])[0].facilitySite).toBe('hospital');
  expect(inventoryPlacement([robot], [])[0].facilitySite).toBeNull();
});

it('draws a registered site without inventing a position for its unreported robots', () => {
  const common = {
    id: 'registered',
    name: 'Factory',
    parent: null,
    status: 'unknown',
    observedAt: null,
    stale: true,
    registration: registerControls(siteControls),
  };

  expect(markerPosition({ ...common, kind: 'site' }, false)?.length()).toBeGreaterThan(0.99);
  expect(markerPosition({ ...common, kind: 'robot' }, false)).toBeNull();
});

it('projects a nested facility pose into the viewed facility without replacing its source frame', () => {
  const viewed = registerControls(siteControls);
  const nested = registerControls({
    ...siteControls,
    controls: siteControls.controls.map((control) => ({ ...control, altitudeM: control.altitudeM + 10 })),
  });
  const robot: RegistryItem = {
    id: 'nested-robot',
    name: 'Delivery',
    parent: 'ward',
    status: 'online',
    stale: false,
    observedAt: null,
    registration: nested,
    facility: { name: 'Ward', hash: 'a'.repeat(64) },
    pose: {
      frame: 'facility',
      facility: 'a'.repeat(64),
      pointM: [0, 0, 2],
      quality: 'reported',
      observedAt: new Date().toISOString(),
    },
  };
  const local = markerPosition(robot, true, viewed);

  expect(local?.x).toBeCloseTo(0, 3);
  expect(local?.y).toBeCloseTo(0, 3);
  expect(local?.z).toBeCloseTo(12, 3);
  expect(robotPosition(robot)?.altitudeM).toBeCloseTo(32, 2);
});
