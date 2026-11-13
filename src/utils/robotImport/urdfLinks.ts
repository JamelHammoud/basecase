import * as THREE from 'three';
import { toMj } from '../../sim/mjcfFrames';
import type { SimBody } from '../../sim/mjcfTypes';
import type { ScenePart } from '../../types/robotics';
import type { PartMass } from '../engineeringTypes';
import { partMatrix, type V3 } from '../kinematics';

export const MIN_LINK_KG = 0.0005;

const MIN_INERTIA = 1e-8;

export interface PlacedPart {
  part: ScenePart;
  triangles: Float32Array;
  kg: number;
  com: V3;
  size: V3;
}

export interface LinkInertial {
  kg: number;
  com: V3;
  inertia: { ixx: number; ixy: number; ixz: number; iyy: number; iyz: number; izz: number };
}

function boxTriangles(p: ScenePart): Float32Array {
  const d = p.dimensions;
  const box = new THREE.BoxGeometry(Math.max(d.width, 1), Math.max(d.height, 1), Math.max(d.depth, 1));

  return new Float32Array(box.toNonIndexed().getAttribute('position').array);
}

function placeTriangles(local: Float32Array, p: ScenePart, origin: V3): { triangles: Float32Array; box: THREE.Box3 } {
  const place = partMatrix(p);
  const out = new Float32Array(local.length);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  for (let i = 0; i + 2 < local.length; i += 3) {
    v.set(local[i], local[i + 1], local[i + 2]).applyMatrix4(place);

    const m = toMj([v.x - origin[0], v.y - origin[1], v.z - origin[2]]);

    out.set(m, i);
    box.expandByPoint(v.set(...m));
  }

  return { triangles: out, box };
}

interface PlaceOptions {
  body: SimBody;
  byId: Map<string, ScenePart>;
  masses: Map<string, PartMass>;
  triangles: (id: string) => Float32Array | null;
}

export function placedParts({ body, byId, masses, triangles }: PlaceOptions): PlacedPart[] {
  return body.parts.flatMap((id) => {
    const part = byId.get(id);

    if (!part) return [];

    const local = triangles(id);
    const placed = placeTriangles(local && local.length >= 9 ? local : boxTriangles(part), part, body.origin);
    const mass = masses.get(id);
    const center = placed.box.getCenter(new THREE.Vector3());
    const com = mass
      ? toMj([0, 1, 2].map((a) => mass.centroid[a] - body.origin[a]) as V3)
      : ([center.x, center.y, center.z] as V3);
    const size = placed.box.getSize(new THREE.Vector3());

    return [{ part, triangles: placed.triangles, kg: (mass?.grams ?? 0) / 1000, com, size: [size.x, size.y, size.z] }];
  });
}

const sq = (v: number) => v * v;

export function linkInertial(parts: PlacedPart[]): LinkInertial {
  const kg = parts.reduce((s, p) => s + p.kg, 0);
  const com = [0, 1, 2].map((a) => (kg > 0 ? parts.reduce((s, p) => s + p.kg * p.com[a], 0) / kg : 0)) as V3;
  const I = { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 };

  for (const { kg: m, com: c, size } of parts) {
    const [a, b, h] = size;
    const [dx, dy, dz] = [c[0] - com[0], c[1] - com[1], c[2] - com[2]];

    I.ixx += (m / 12) * (sq(b) + sq(h)) + m * (sq(dy) + sq(dz));
    I.iyy += (m / 12) * (sq(a) + sq(h)) + m * (sq(dx) + sq(dz));
    I.izz += (m / 12) * (sq(a) + sq(b)) + m * (sq(dx) + sq(dy));
    I.ixy -= m * dx * dy;
    I.ixz -= m * dx * dz;
    I.iyz -= m * dy * dz;
  }

  I.ixx = Math.max(I.ixx, MIN_INERTIA);
  I.iyy = Math.max(I.iyy, MIN_INERTIA);
  I.izz = Math.max(I.izz, MIN_INERTIA);

  return { kg: Math.max(kg, MIN_LINK_KG), com, inertia: I };
}
