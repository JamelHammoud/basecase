import type { ManifoldApi, Solid } from '../wrap/manifold';
import { meshOfSolid, soupOfMesh } from '../wrap/manifold';
import { CradleResources } from './cradlePreparation';
import type { CradleInput } from './cradleTypes';

export const CRADLE_ASSEMBLIES = [
  'servo bracket',
  'bearing housing',
  'repeated leg module',
  'pan-tilt base',
  'gripper body',
  'wheel hub assembly',
  'electronics tray',
  'fixed-arm elbow module',
  'conveyor roller support',
  'asymmetric sensor mount',
] as const;

function fixtureShapes(api: ManifoldApi, resources: CradleResources): Solid[] {
  const own = <T extends { delete: () => void }>(value: T) => resources.own(value);
  const box = (x: number, y: number, z: number) => own(api.Manifold.cube([x, y, z]));
  const cylinder = (radius: number, height: number) => own(api.Manifold.cylinder(height, radius, radius, 32));
  const move = (shape: Solid, x: number, y: number, z = 0) => own(shape.translate([x, y, z]));
  const subtract = (a: Solid, b: Solid) => own(a.subtract(b));
  const union = (a: Solid, b: Solid) => own(a.add(b));
  const profile = (points: Array<[number, number]>, height: number) =>
    own(own(new api.CrossSection([points])).extrude(height));

  return [
    subtract(box(44, 32, 16), move(box(30, 28, 20), 7, 8, -1)),
    subtract(box(32, 32, 16), move(cylinder(11, 20), 16, 16, -1)),
    union(box(64, 14, 16), move(box(22, 42, 16), 21, 0)),
    union(cylinder(22, 8), move(cylinder(12, 18), 0, 0, 4)),
    profile(
      [
        [0, 0],
        [42, 0],
        [48, 24],
        [36, 32],
        [8, 32],
        [-4, 24],
      ],
      16,
    ),
    subtract(union(cylinder(18, 16), box(24, 10, 16)), cylinder(5, 20)),
    subtract(box(72, 48, 12), move(box(66, 42, 14), 3, 3, 3)),
    subtract(union(box(48, 16, 16), box(16, 48, 16)), move(cylinder(4, 20), 8, 34, -1)),
    subtract(box(48, 38, 20), move(box(28, 30, 24), 10, 12, -1)),
    profile(
      [
        [0, 0],
        [46, 0],
        [46, 12],
        [22, 12],
        [22, 30],
        [8, 38],
        [0, 30],
      ],
      16,
    ),
  ];
}

export function cradleFixture(api: ManifoldApi, index: number): CradleInput {
  const resources = new CradleResources();

  try {
    const shapes = fixtureShapes(api, resources);
    const positions = soupOfMesh(meshOfSolid(shapes[index]));

    return {
      sources: [{ id: CRADLE_ASSEMBLIES[index], positions }],
      down: [0, 0, -1],
      clearanceMm: 0.3,
      baseMm: 3,
      wallMm: 2,
      depthMm: 6,
    };
  } finally {
    resources.dispose();
  }
}
