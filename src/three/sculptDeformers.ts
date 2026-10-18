import * as THREE from 'three';
import type { PartDeformers } from '../types/robotics';

interface DeformFrame {
  height: number;
  halfX: number;
  halfY: number;
  halfZ: number;
  midY: number;
}

interface Deform {
  taper: number;
  twistRad: number;
  bendRad: number;
  roundness: number;
}

function roundVertex(v: THREE.Vector3, frame: DeformFrame, roundness: number) {
  const nx = v.x / frame.halfX;
  const ny = v.y / frame.halfY;
  const nz = v.z / frame.halfZ;
  const len = Math.hypot(nx, ny, nz);

  if (len <= 1e-4) return;

  v.x = THREE.MathUtils.lerp(v.x, (nx / len) * frame.halfX, roundness);
  v.y = THREE.MathUtils.lerp(v.y, (ny / len) * frame.halfY, roundness);
  v.z = THREE.MathUtils.lerp(v.z, (nz / len) * frame.halfZ, roundness);
}

function taperVertex(v: THREE.Vector3, t: number, taper: number) {
  const scaleFactor = Math.max(0.08, 1 + taper * (t + 0.5));

  v.x *= scaleFactor;
  v.z *= scaleFactor;
}

function twistVertex(v: THREE.Vector3, t: number, twistRad: number) {
  const angle = twistRad * t;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = v.x * cos - v.z * sin;
  const rz = v.x * sin + v.z * cos;

  v.x = rx;
  v.z = rz;
}

function bendVertex(v: THREE.Vector3, height: number, bendRad: number) {
  const radius = height / bendRad;
  const theta = v.y / radius;
  const offsetX = radius - v.x;

  v.x = radius - Math.cos(theta) * offsetX;
  v.y = Math.sin(theta) * offsetX;
}

function deformVertex(v: THREE.Vector3, frame: DeformFrame, deform: Deform) {
  const t = (v.y - frame.midY) / frame.height;

  if (deform.roundness > 0.001) roundVertex(v, frame, deform.roundness);

  if (Math.abs(deform.taper) > 0.001) taperVertex(v, t, deform.taper);

  if (Math.abs(deform.twistRad) > 0.001) twistVertex(v, t, deform.twistRad);

  if (Math.abs(deform.bendRad) > 0.001) bendVertex(v, frame.height, deform.bendRad);
}

const hasNoEffect = ({ taper = 0, twistDeg = 0, bendDeg = 0, roundness = 0 }: PartDeformers) =>
  Math.abs(taper) < 0.001 && Math.abs(twistDeg) < 0.1 && Math.abs(bendDeg) < 0.1 && roundness < 0.001;

export function applyDeformersToBufferGeometry(geo: THREE.BufferGeometry, deformers?: PartDeformers): void {
  if (!deformers || hasNoEffect(deformers)) return;

  const { taper = 0, twistDeg = 0, bendDeg = 0, roundness = 0 } = deformers;

  geo.computeBoundingBox();

  const box = geo.boundingBox!;
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const frame: DeformFrame = {
    height,
    halfX: Math.max(1e-3, (box.max.x - box.min.x) / 2),
    halfY: height / 2,
    halfZ: Math.max(1e-3, (box.max.z - box.min.z) / 2),
    midY: (box.min.y + box.max.y) / 2,
  };
  const deform: Deform = {
    taper,
    twistRad: THREE.MathUtils.degToRad(twistDeg),
    bendRad: THREE.MathUtils.degToRad(bendDeg),
    roundness,
  };
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    deformVertex(v, frame, deform);
    posAttr.setXYZ(i, v.x, v.y, v.z);
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
}
