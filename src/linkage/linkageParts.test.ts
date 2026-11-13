import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRig } from '../utils/kinematics';
import { couplerPoint, type LinkageSolution } from '../utils/linkage';
import { posedPort } from '../utils/posedPort';
import { GROUND_PLANE, type SketchPlane } from '../utils/sketch/placement';
import { linkageParts } from './linkageParts';

const SOLUTION: LinkageSolution = {
  linkage: { origin: [12, -30], angle: 25, ground: 40, crank: 20, coupler: 50, rocker: 50, point: [100, 0] },
  maxErrorMm: 0,
  rmsErrorMm: 0,
  minTransmissionDeg: 23,
  crank: [40, 290],
  grashof: 'crank-rocker',
};

const TILTED: SketchPlane = { origin: [10, 40, -5], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0] };

function inPlane(plane: SketchPlane, p: number[]): [number, number] {
  const d = new THREE.Vector3(...p).sub(new THREE.Vector3(...plane.origin));

  return [d.dot(new THREE.Vector3(...plane.u)), d.dot(new THREE.Vector3(...plane.v))];
}

describe.each([
  ['the ground plane', GROUND_PLANE],
  ['a tilted face', TILTED],
])('a linkage placed on %s', (_, plane) => {
  const built = linkageParts(SOLUTION, plane, 'fb');
  const rig = buildRig(built.joints, built.parts);
  const coupler = built.parts.find((p) => p.id === built.coupler)!;

  it('traces its coupler curve as the crank turns', () => {
    for (let v = 0; v <= 250; v += 10) {
      const at = posedPort(rig, { values: { [built.crankJoint]: v } }, { part: coupler, port: 'P' })!;
      const want = couplerPoint(SOLUTION.linkage, SOLUTION.crank[0] + v)!;
      const got = inPlane(plane, at);

      expect(Math.hypot(got[0] - want[0], got[1] - want[1])).toBeLessThan(0.05);
    }
  });

  it('turns the crank by its servo, across the drawn sweep', () => {
    const crank = built.joints.find((j) => j.id === built.crankJoint)!;
    const servo = built.parts.find((p) => p.componentId === 'feetech-sts3215')!;

    expect(crank.actuators).toEqual([servo.id]);
    expect(crank.range).toEqual([0, 250]);
    expect(servo.mates?.[0]).toMatchObject({ port: 'output', target: 'fb-ground', targetPort: 'A', type: 'coaxial' });
  });

  it('stands the servo on the plane, under the bars', () => {
    const n = new THREE.Vector3(...plane.u).cross(new THREE.Vector3(...plane.v));
    const servo = built.parts.find((p) => p.componentId)!;
    const ground = built.parts.find((p) => p.id === 'fb-ground')!;
    const height = (p: number[]) => new THREE.Vector3(...p).sub(new THREE.Vector3(...plane.origin)).dot(n);

    expect(height(servo.position)).toBeGreaterThan(0);
    expect(height(ground.position)).toBeGreaterThan(height(servo.position));
  });

  it('compiles each bar from the four_bar recipe at the drawn start', () => {
    const bars = built.parts.filter((p) => p.cad);

    expect(bars.map((p) => p.name)).toEqual(['Ground', 'Crank', 'Coupler', 'Rocker']);
    expect(bars.every((p) => p.cad!.pending && p.cad!.code.includes('four_bar(40, 20, 50, 50, theta = 40'))).toBe(true);
  });
});
