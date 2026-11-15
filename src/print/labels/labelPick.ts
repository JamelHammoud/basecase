import * as THREE from 'three';
import type { Placed } from '../../three/analysis/collide';
import type { MeshData } from '../threeMf';
import { textWidth } from './labelFont';
import { flatFaces, type FlatFace, type V3 } from './labelFaces';
import { fitLabel, insideFace, labelBox, LABEL_MM, type LabelSpot } from './labelFit';
import { labelPoint } from './labelGlyph';
import { randomPoints } from './labelSamples';

export interface LabelTarget {
  id: string;
  text: string;
  down: V3;
}

export interface LabelPick {
  face: FlatFace;
  spot: LabelSpot;
}

export const CONTACT_MM = 1.5;

const CANDIDATES = 16;
const FACING_BED = 0.7;
const DIRECTIONS = 96;
const EDGE_SAMPLES = 40;
const LIFT_MM = 0.05;
const MIN_BACKING_MM = LABEL_MM.depth + 0.8;

const SPHERE = Array.from({ length: DIRECTIONS }, (_, i) => {
  const y = 1 - ((i + 0.5) / DIRECTIONS) * 2;
  const r = Math.sqrt(1 - y * y);
  const a = i * Math.PI * (3 - Math.sqrt(5));

  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
});

function edgePoints(face: FlatFace): Array<[number, number]> {
  const count = face.edges.length / 4;
  const step = Math.max(1, Math.floor(count / EDGE_SAMPLES));
  const out: Array<[number, number]> = [];

  for (let e = 0; e < count; e += step) {
    const i = e * 4;

    out.push([(face.edges[i] + face.edges[i + 2]) / 2, (face.edges[i + 1] + face.edges[i + 3]) / 2]);
  }

  return out;
}

function spotPoints(face: FlatFace, spot: LabelSpot, width: number): Array<[number, number]> {
  const box = labelBox(spot, width);
  const out: Array<[number, number]> = [];

  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 2; j++)
      out.push([box.minX + ((box.maxX - box.minX) * i) / 4, box.minY + ((box.maxY - box.minY) * j) / 2]);

  return out.filter((p) => insideFace(face, p));
}

const hitTarget = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
const probe = new THREE.Vector3();
const ray = new THREE.Ray();

function touchesOther(others: Placed[], world: THREE.Vector3[]): boolean {
  return world.some((p) =>
    others.some((o) => {
      if (o.box.distanceToPoint(p) > CONTACT_MM) return false;

      probe.copy(p).applyMatrix4(o.inverse);

      return !!o.solid.bvh.closestPointToPoint(probe, hitTarget as never, 0, CONTACT_MM);
    }),
  );
}

function blocked(scene: Placed[], origin: THREE.Vector3, direction: THREE.Vector3): boolean {
  return scene.some((o) => {
    ray.set(origin, direction);

    if (!ray.intersectsBox(o.box)) return false;

    ray.applyMatrix4(o.inverse);

    return !!o.solid.bvh.raycastFirst(ray, THREE.DoubleSide, 0, Infinity);
  });
}

function seenFromOutside(scene: Placed[], world: THREE.Vector3[], normal: THREE.Vector3): boolean {
  const directions = SPHERE.filter((d) => d.dot(normal) > 0.08);
  const origin = new THREE.Vector3();

  return world.some((p) => directions.some((d) => !blocked(scene, origin.copy(p).addScaledVector(normal, LIFT_MM), d)));
}

function backed(owner: Placed, face: FlatFace, points: Array<[number, number]>): boolean {
  const inward = new THREE.Vector3(...face.normal).negate();

  return points.every((p) => {
    ray.set(new THREE.Vector3(...labelPoint(face, p, -0.01)), inward);

    const hit = owner.solid.bvh.raycastFirst(ray, THREE.DoubleSide, 0, Infinity);

    return !!hit && hit.distance >= MIN_BACKING_MM;
  });
}

const minFaceArea = (text: string) => {
  const pad = 2 * (0.8 + LABEL_MM.wall);

  return (textWidth(text) * LABEL_MM.minHeight + pad) * (LABEL_MM.minHeight + pad);
};

function clears(scene: Placed[], owner: Placed, pick: LabelPick, text: string): boolean {
  const { face, spot } = pick;
  const inLabel = spotPoints(face, spot, textWidth(text));

  if (!backed(owner, face, inLabel)) return false;

  const toWorld = (p: [number, number]) => new THREE.Vector3(...labelPoint(face, p, 0)).applyMatrix4(owner.matrix);
  const others = scene.filter((o) => o !== owner);
  const samples = [...inLabel, ...randomPoints(face.tris)].map(toWorld);
  const surface = [...samples, ...edgePoints(face).map(toWorld)];

  if (touchesOther(others, surface)) return false;

  const normal = new THREE.Vector3(...face.normal).transformDirection(owner.matrix);

  return !seenFromOutside(scene, samples, normal);
}

export function pickLabel(scene: Placed[], target: LabelTarget, mesh: MeshData): LabelPick | null {
  const owner = scene.find((o) => o.id === target.id);

  if (!owner) return null;

  const faces = flatFaces(mesh, minFaceArea(target.text)).slice(0, CANDIDATES);
  const down = new THREE.Vector3(...target.down).normalize();

  for (const face of faces) {
    if (new THREE.Vector3(...face.normal).dot(down) > FACING_BED) continue;

    const spot = fitLabel(face, target.text);

    if (spot && clears(scene, owner, { face, spot }, target.text)) return { face, spot };
  }

  return null;
}
