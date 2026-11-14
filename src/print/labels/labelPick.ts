import * as THREE from 'three';
import type { Placed } from '../../three/analysis/collide';
import type { MeshData } from '../threeMf';
import { textWidth } from './labelFont';
import { flatFaces, type FlatFace, type V3 } from './labelFaces';
import { fitLabel, insideFace, labelBox, LABEL_MM, type LabelSpot } from './labelFit';
import { labelPoint } from './labelGlyph';

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
const RANDOM_SAMPLES = 40;
const EDGE_SAMPLES = 40;
const LIFT_MM = 0.05;
const MIN_BACKING_MM = LABEL_MM.depth + 0.8;

const SPHERE = Array.from({ length: DIRECTIONS }, (_, i) => {
  const y = 1 - ((i + 0.5) / DIRECTIONS) * 2;
  const r = Math.sqrt(1 - y * y);
  const a = i * Math.PI * (3 - Math.sqrt(5));

  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
});

function seeded(seed: number) {
  let s = seed >>> 0;

  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;

    return s / 4294967296;
  };
}

function randomPoints(face: FlatFace): Array<[number, number]> {
  const t = face.tris;
  const areas: number[] = [];
  let sum = 0;

  for (let i = 0; i < t.length; i += 6) {
    sum += Math.abs((t[i + 2] - t[i]) * (t[i + 5] - t[i + 1]) - (t[i + 4] - t[i]) * (t[i + 3] - t[i + 1])) / 2;
    areas.push(sum);
  }

  const random = seeded(7);

  return Array.from({ length: RANDOM_SAMPLES }, () => {
    const target = random() * sum;
    const i =
      Math.max(
        0,
        areas.findIndex((a) => a >= target),
      ) * 6;
    let [u, v] = [random(), random()];

    if (u + v > 1) [u, v] = [1 - u, 1 - v];

    return [
      t[i] + (t[i + 2] - t[i]) * u + (t[i + 4] - t[i]) * v,
      t[i + 1] + (t[i + 3] - t[i + 1]) * u + (t[i + 5] - t[i + 1]) * v,
    ];
  });
}

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
  const surface = [...inLabel, ...randomPoints(face), ...edgePoints(face)].map(toWorld);

  if (touchesOther(others, surface)) return false;

  const normal = new THREE.Vector3(...face.normal).transformDirection(owner.matrix);

  return !seenFromOutside(scene, [...inLabel, ...randomPoints(face)].map(toWorld), normal);
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
