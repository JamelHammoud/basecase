import * as THREE from 'three';
import { WGS84_ELLIPSOID } from '3d-tiles-renderer/three';
import { ROS_TO_SCENE } from '../three/viewport/dataFrames';

const rad = THREE.MathUtils.degToRad;

export const ecefOf = (lat: number, lon: number, heightM: number, target = new THREE.Vector3()) =>
  WGS84_ELLIPSOID.getCartographicToPosition(rad(lat), rad(lon), heightM, target);

export function heightOf(ecef: THREE.Vector3): number {
  const at = { lat: 0, lon: 0, height: 0 };

  WGS84_ELLIPSOID.getPositionToCartographic(ecef, at);

  return at.height;
}

export function earthFrame(lat: number, lon: number, heightM: number): THREE.Matrix4 {
  const enu = WGS84_ELLIPSOID.getEastNorthUpFrame(rad(lat), rad(lon), heightM, new THREE.Matrix4());

  return enu.invert().premultiply(ROS_TO_SCENE);
}

export function downRay(lat: number, lon: number, heightM: number): THREE.Ray {
  const from = ecefOf(lat, lon, heightM);
  const down = ecefOf(lat, lon, heightM - 1)
    .sub(from)
    .normalize();

  return new THREE.Ray(from, down);
}
