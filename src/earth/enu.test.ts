import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { earthFrame, ecefOf, heightOf } from './enu';

const SPOT = { lat: 37.7793, lon: -122.4193 };
const GROUND_M = 16;
const WGS84_A = 6378137;
const WGS84_E2 = 6.69437999014e-3;

const metresPerDegree = (latDeg: number) => {
  const s = Math.sin(THREE.MathUtils.degToRad(latDeg));
  const meridian = (WGS84_A * (1 - WGS84_E2)) / Math.pow(1 - WGS84_E2 * s * s, 1.5);
  const prime = WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s);

  return {
    north: THREE.MathUtils.degToRad(meridian),
    east: THREE.MathUtils.degToRad(prime * Math.cos(THREE.MathUtils.degToRad(latDeg))),
  };
};

const sceneOf = (lat: number, lon: number, heightM: number) =>
  ecefOf(lat, lon, heightM).applyMatrix4(earthFrame(SPOT.lat, SPOT.lon, GROUND_M));

describe('earthFrame', () => {
  it('lands a fix 10 m north 10 m along the scene’s north, -Z', () => {
    const step = metresPerDegree(SPOT.lat);
    const north = sceneOf(SPOT.lat + 10 / step.north, SPOT.lon, GROUND_M);

    expect(north.x).toBeCloseTo(0, 0);
    expect(north.z).toBeCloseTo(-10000, -1);
    expect(Math.abs(north.y)).toBeLessThan(20);
  });

  it('puts east on +X and up on +Y, in millimetres, with the origin at the floor', () => {
    const step = metresPerDegree(SPOT.lat);
    const east = sceneOf(SPOT.lat, SPOT.lon + 10 / step.east, GROUND_M);
    const above = sceneOf(SPOT.lat, SPOT.lon, GROUND_M + 2);
    const origin = sceneOf(SPOT.lat, SPOT.lon, GROUND_M);

    expect(east.x).toBeCloseTo(10000, -1);
    expect(east.z).toBeCloseTo(0, 0);
    expect(above.distanceTo(new THREE.Vector3(0, 2000, 0))).toBeLessThan(1);
    expect(origin.length()).toBeLessThan(1);
  });

  it('reads back the height a point was placed at', () => {
    expect(heightOf(ecefOf(SPOT.lat, SPOT.lon, 1234.5))).toBeCloseTo(1234.5, 3);
  });
});
