import * as THREE from 'three';
import { CAMERA_VIEWS } from '../data/cameraViews';
import type { MirrorLink } from '../types/ports';

export type V3 = [number, number, number];

export type MirrorAxis = 0 | 1 | 2;

export interface MirrorPlane {
  axis: MirrorAxis;
  offset: number;
}

export type PlaneView = 'right' | 'front' | 'top';

export const PLANE_VIEWS: PlaneView[] = ['right', 'front', 'top'];

export const VIEW_AXIS: Record<PlaneView, MirrorAxis> = { right: 0, top: 1, front: 2 };

export const AGENT_AXIS: Record<MirrorAxis, MirrorLink['axis']> = { 0: 'x', 1: 'z', 2: 'y' };

export const planeLabel = (view: PlaneView) => CAMERA_VIEWS.find((v) => v.id === view)?.label ?? view;

export const reflectValue = (v: number, offset: number) => (offset === 0 ? -v : 2 * offset - v);

export function reflectPoint(p: V3, plane: MirrorPlane): V3 {
  const out: V3 = [...p];

  out[plane.axis] = reflectValue(p[plane.axis], plane.offset);

  return out;
}

export function flipAxis(v: V3, k: number): V3 {
  const out: V3 = [...v];

  out[k] = -out[k];

  return out;
}

export const flipMatrix = (k: number) =>
  new THREE.Matrix4().makeScale(k === 0 ? -1 : 1, k === 1 ? -1 : 1, k === 2 ? -1 : 1);

let remembered: PlaneView = 'right';

export const lastPlaneView = () => remembered;

export function rememberPlaneView(view: PlaneView) {
  remembered = view;
}
