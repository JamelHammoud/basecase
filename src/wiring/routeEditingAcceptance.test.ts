import { expect, it } from 'vitest';
import { component, sceneOf } from './fixtures';
import { box, joint } from '../sim/fixtures/parts';
import { analyzeWiring } from './routeAnalysis';
import { editableNets, routeIdentity, updateRoute } from './routeEditing';
import type { RouteObstacle } from './routeGeometry';

function arm() {
  return sceneOf(
    [
      component('adapter', 'waveshare-bus-servo-adapter-a'),
      { ...component('servo', 'feetech-sts3215', 'c001'), position: [70, 0, 0] },
    ],
    [
      joint({
        id: 'elbow',
        link: ['adapter', 'servo'],
        origin: [0, 0, 0],
        axis: [0, 0, 1],
        effortNm: 1,
        range: [-90, 90],
      }),
    ],
  );
}

const obstacle: RouteObstacle = { id: 'wall', min: [35, -20, -20], max: [45, 20, 20] };

it('repairs a changing detour topology with an authored anchor and retains its exact limiting pose and required length', () => {
  const scene = arm();
  const identity = routeIdentity(editableNets(scene)[0])!;
  const before = analyzeWiring(scene, [obstacle]).buses[0].nets[0].route!;
  const project = updateRoute(scene, identity, {
    supplyId: 'waveshare-servo-cable-5264-900',
    anchors: [{ partId: 'adapter', position: [30, 40, 160] }],
  });
  const edited = { ...scene, project };
  const after = analyzeWiring(edited, [obstacle]).buses[0].nets[0].route!;

  expect(before).toMatchObject({
    status: 'unresolved',
    reason: 'Route changes around a solid',
    limitingPose: { elbow: -90 },
  });
  expect(after).toMatchObject({
    status: 'pass',
    requiredMm: 486,
    cableSupplyId: 'waveshare-servo-cable-5264-900',
    limitingPose: { elbow: -90 },
  });
  expect(after.points[2]).toEqual([30, 40, 160]);

  const short = updateRoute(edited, identity, { supplyId: 'waveshare-servo-cable-5264-300' });

  expect(analyzeWiring({ ...scene, project: short }, [obstacle]).buses[0].nets[0].route).toMatchObject({
    status: 'fail',
    requiredMm: 486,
    lengthMm: 300,
    reason: 'Cable too short',
    limitingPose: { elbow: -90 },
  });
});

it('keeps blocked connector exits and missing anchor owners unresolved after route editing', () => {
  const scene = arm();
  const clip = box('clip', [0, 0, 0], [10, 10, 10], 5);
  const source = { ...scene, parts: [...scene.parts, clip] };
  const identity = routeIdentity(editableNets(source)[0])!;
  const project = updateRoute(source, identity, {
    supplyId: 'waveshare-servo-cable-5264-900',
    anchors: [{ partId: 'clip', position: [30, 40, 160] }],
  });
  const blocked: RouteObstacle = { id: 'neighbor', min: [0, -50, -50], max: [20, 50, 50] };

  expect(analyzeWiring({ ...source, project }, [blocked]).buses[0].nets[0].route).toMatchObject({
    status: 'unresolved',
    reason: 'Route blocked',
  });
  expect(analyzeWiring({ ...scene, project }, []).buses[0].nets[0].route).toMatchObject({
    status: 'unresolved',
    reason: 'Routing anchor missing',
  });
  expect(() => updateRoute({ ...scene, project }, identity, { supplyId: 'robot-cable-x3p' })).toThrow();
});

it('keeps an unsupported loop closure unresolved after selecting stock and an anchor', () => {
  const scene = arm();
  const follower = box('follower', [100, 0, 0], [10, 10, 10], 5);
  const closed = sceneOf(
    [...scene.parts, follower],
    [
      ...scene.project.joints!,
      {
        ...scene.project.joints![0],
        id: 'follower',
        type: 'fixed',
        child: ['follower'],
        loop: {
          driver: 'elbow',
          link: 'rocker',
          fourBar: { ground: 20, crank: 10, coupler: 20, rocker: 10, theta: 0 },
        },
      },
    ],
  );
  const identity = routeIdentity(editableNets(closed)[0])!;
  const project = updateRoute(closed, identity, {
    supplyId: 'waveshare-servo-cable-5264-900',
    anchors: [{ partId: 'adapter', position: [30, 40, 160] }],
  });

  expect(analyzeWiring({ ...closed, project }, []).buses[0].nets[0].route).toMatchObject({
    status: 'unresolved',
    reason: 'Coupled linkage geometry unresolved',
  });
});
