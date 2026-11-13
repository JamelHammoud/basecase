import * as THREE from 'three';
import { BASE_LINK, type V3, type WrapBody, type WrapInput, type WrapJoint } from './wrapTypes';

const MM = 0.6;
const mm = (v: V3): V3 => [v[0] * MM, v[1] * MM, v[2] * MM];

function soupOf(geometry: THREE.BufferGeometry, at: V3): Float32Array {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;

  flat.translate(...at);

  return Float32Array.from(flat.getAttribute('position').array);
}

const box = (size: V3, at: V3) => soupOf(new THREE.BoxGeometry(...mm(size)), mm(at));

export const capsuleSoup = () => soupOf(new THREE.CapsuleGeometry(10, 30, 8, 24), [40, 5, -20]);

export const ARM_BODIES: WrapBody[] = [
  { id: 'base', link: BASE_LINK, soup: box([34, 40, 34], [0, 20, 0]) },
  { id: 'servo', link: BASE_LINK, soup: box([20, 14, 24], [0, 48, 0]) },
  { id: 'upper', link: 'shoulder', soup: box([14, 46, 14], [0, 82, 0]) },
  { id: 'lower', link: 'elbow', soup: box([12, 40, 12], [0, 134, 0]) },
];

export const ARM_JOINTS: WrapJoint[] = [
  {
    id: 'shoulder',
    type: 'revolute',
    origin: mm([0, 56, 0]),
    axis: [0, 0, 1],
    range: [-45, 45],
    parentLink: BASE_LINK,
    floor: true,
  },
  {
    id: 'elbow',
    type: 'revolute',
    origin: mm([0, 110, 0]),
    axis: [0, 0, 1],
    range: [-60, 60],
    parentLink: 'shoulder',
    floor: true,
  },
];

export const armInput = (): WrapInput => ({ mesh: capsuleSoup(), bodies: ARM_BODIES, joints: ARM_JOINTS, floorY: 0 });
