import * as THREE from 'three';
import { ShapeSolid } from './shapeSolid';

export interface RotorSplit {
  stator: ShapeSolid;
  rotor: ShapeSolid;
}

const ON_AXIS_MM = 1;
const MAX_ROTOR_REACH = 0.8;

const bodyCache = new WeakMap<Float32Array, Uint32Array>();
const splitCache = new WeakMap<ShapeSolid, RotorSplit | null>();

function root(parent: number[], x: number) {
  let r = x;

  while (parent[r] !== r) {
    parent[r] = parent[parent[r]];
    r = parent[r];
  }

  return r;
}

function triangleBodies(positions: Float32Array): Uint32Array {
  const cached = bodyCache.get(positions);

  if (cached) return cached;

  const ids = new Map<string, number>();
  const parent: number[] = [];
  const vertex = new Uint32Array(positions.length / 3);

  for (let v = 0; v < vertex.length; v++) {
    const key = `${Math.round(positions[v * 3] * 1e3)},${Math.round(positions[v * 3 + 1] * 1e3)},${Math.round(positions[v * 3 + 2] * 1e3)}`;
    const known = ids.get(key);
    const id = known ?? ids.size;

    if (known === undefined) {
      ids.set(key, id);
      parent.push(id);
    }

    vertex[v] = id;
  }

  for (let v = 0; v < vertex.length; v += 3) {
    const a = root(parent, vertex[v]);

    parent[root(parent, vertex[v + 1])] = a;
    parent[root(parent, vertex[v + 2])] = a;
  }

  const bodies = new Uint32Array(vertex.length / 3);

  for (let t = 0; t < bodies.length; t++) bodies[t] = root(parent, vertex[t * 3]);

  bodyCache.set(positions, bodies);

  return bodies;
}

interface Body {
  box: THREE.Box3;
  reach: number;
}

function measureBodies(solid: ShapeSolid, bodies: Uint32Array, line: THREE.Line3): Map<number, Body> {
  const out = new Map<number, Body>();
  const p = new THREE.Vector3();
  const foot = new THREE.Vector3();

  for (let v = 0; v < solid.positions.length / 3; v++) {
    const body = out.get(bodies[Math.floor(v / 3)]) ?? { box: new THREE.Box3(), reach: 0 };

    p.fromArray(solid.positions, v * 3);
    body.box.expandByPoint(p);
    body.reach = Math.max(body.reach, line.closestPointToPoint(p, false, foot).distanceTo(p));
    out.set(bodies[Math.floor(v / 3)], body);
  }

  return out;
}

function rotorBodies(solid: ShapeSolid, line: THREE.Line3): Set<number> {
  const bodies = triangleBodies(solid.positions);
  const measured = measureBodies(solid, bodies, line);
  const reach = Math.max(...[...measured.values()].map((b) => b.reach));
  const center = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const onAxis = (b: Body) => line.closestPointToPoint(b.box.getCenter(center), false, foot).distanceTo(center);

  return new Set(
    [...measured].filter(([, b]) => onAxis(b) <= ON_AXIS_MM && b.reach <= MAX_ROTOR_REACH * reach).map(([id]) => id),
  );
}

function trianglesOf(positions: Float32Array, keep: (t: number) => boolean) {
  const out: number[] = [];

  for (let t = 0; t < positions.length / 9; t++) {
    if (keep(t)) for (let k = 0; k < 9; k++) out.push(positions[t * 9 + k]);
  }

  return new ShapeSolid(new Float32Array(out));
}

const OUTPUT_FACE_BAND = 0.6;

export function outputLine(positions: ArrayLike<number>): THREE.Line3 {
  let top = -Infinity;

  for (let i = 1; i < positions.length; i += 3) top = Math.max(top, positions[i]);

  let x = 0,
    z = 0,
    n = 0;

  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] < top - OUTPUT_FACE_BAND) continue;

    x += positions[i];
    z += positions[i + 2];
    n++;
  }

  return new THREE.Line3(new THREE.Vector3(x / n, top, z / n), new THREE.Vector3(x / n, top + 1, z / n));
}

export function splitRotor(solid: ShapeSolid): RotorSplit | null {
  if (splitCache.has(solid)) return splitCache.get(solid)!;

  const rotor = rotorBodies(solid, outputLine(solid.positions));
  const bodies = triangleBodies(solid.positions);
  const split =
    rotor.size && rotor.size < new Set(bodies).size
      ? {
          stator: trianglesOf(solid.positions, (t) => !rotor.has(bodies[t])),
          rotor: trianglesOf(solid.positions, (t) => rotor.has(bodies[t])),
        }
      : null;

  splitCache.set(solid, split);

  return split;
}
