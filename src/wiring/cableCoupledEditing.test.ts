import { expect, it } from 'vitest';
import type { PortVec } from '../types/ports';
import { cableEditingDesigns } from './cableEditing.fixtures';
import { editableNets, routeIdentity, updateRoute } from './routeEditing';
import { analyzeWiring } from './routeAnalysis';

function turn(point: PortVec, pivot: [number, number], degrees: number): PortVec {
  const radians = (degrees * Math.PI) / 180;
  const x = point[0] - pivot[0];
  const y = point[1] - pivot[1];

  return [
    pivot[0] + Math.cos(radians) * x - Math.sin(radians) * y,
    pivot[1] + Math.sin(radians) * x + Math.cos(radians) * y,
    point[2],
  ];
}

const length = (points: PortVec[]) =>
  points
    .slice(1)
    .reduce((sum, point, index) => sum + Math.hypot(...point.map((value, axis) => value - points[index][axis])), 0);

it('covers simultaneous shoulder and wrist motion through an anchor on the downstream link', () => {
  const scene = cableEditingDesigns()[0].scene;
  const identity = routeIdentity(editableNets(scene)[0])!;
  const project = updateRoute(scene, identity, {
    supplyId: 'waveshare-servo-cable-5264-900',
    anchors: [{ partId: 'servo2', position: [0, 80, 0] }],
  });
  const route = analyzeWiring({ ...scene, project }, []).buses[0].nets[0].route!;

  expect(route).toMatchObject({
    status: 'pass',
    requiredMm: 417,
    limitingPose: { 'servo-joint1': -15, 'servo-joint2': -15 },
  });
  expect(route.points[2]).toEqual([140, 120, 0]);

  let denseMaximumMm = 0;

  for (let shoulder = -15; shoulder <= 15; shoulder++) {
    for (let wrist = -15; wrist <= 15; wrist++) {
      const anchor = turn(turn([140, 120, 0], [140, 40], wrist), [70, 40], shoulder);
      const exit = turn([100.5, 28, -5], [70, 40], shoulder);
      const socket = turn([92.5, 28, -5], [70, 40], shoulder);
      const physical = Math.ceil((length([[13.5, 5.3, -0.3], [13.5, 13.3, -0.3], anchor, exit, socket]) + 9) * 1.15);

      denseMaximumMm = Math.max(denseMaximumMm, physical);
    }
  }

  expect(route.requiredMm).toBeGreaterThanOrEqual(denseMaximumMm);
  expect(denseMaximumMm).toBeGreaterThan(300);

  const short = updateRoute({ ...scene, project }, identity, { supplyId: 'waveshare-servo-cable-5264-300' });

  expect(analyzeWiring({ ...scene, project: short }, []).buses[0].nets[0].route).toMatchObject({
    status: 'fail',
    requiredMm: 417,
  });
});
