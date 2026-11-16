import * as THREE from 'three';
import { ShapeSolid } from './shapeSolid';
import { prepareLineDistance } from './lineDistance';

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

function measureBodies(
  solid: ShapeSolid,
  bodies: Uint32Array,
  distance: (point: THREE.Vector3) => number,
): Map<number, Body> {
  const out = new Map<number, Body>();
  const p = new THREE.Vector3();

  for (let i = 0; i < solid.positions.length; i += 9) {
    const id = bodies[i / 9];
    const body = out.get(id) ?? { box: new THREE.Box3(), reach: 0 };
    const end = Math.min(i + 9, solid.positions.length);

    for (let v = i; v < end; v += 3) {
      p.fromArray(solid.positions, v);
      body.box.expandByPoint(p);
      body.reach = Math.max(body.reach, distance(p));
    }

    out.set(id, body);
  }

  return out;
}

function rotorBodies(solid: ShapeSolid, line: THREE.Line3): Set<number> {
  const bodies = triangleBodies(solid.positions);
  const distance = prepareLineDistance(line);
  const measured = measureBodies(solid, bodies, distance);
  const reach = Math.max(...[...measured.values()].map((b) => b.reach));
  const center = new THREE.Vector3();
  const onAxis = (b: Body) => distance(b.box.getCenter(center));

  return new Set(
    [...measured].filter(([, b]) => onAxis(b) <= ON_AXIS_MM && b.reach <= MAX_ROTOR_REACH * reach).map(([id]) => id),
  );
}

function partitionTriangles(positions: Float32Array, bodies: Uint32Array, rotorBodies: Set<number>): RotorSplit {
  let rotorCount = 0;

  for (const body of bodies) {
    if (rotorBodies.has(body)) rotorCount++;
  }

  const rotor = new Float32Array(rotorCount * 9);
  const stator = new Float32Array((Math.ceil(positions.length / 9) - rotorCount) * 9);
  let rotorAt = 0;
  let statorAt = 0;

  for (let t = 0; t < positions.length / 9; t++) {
    const moving = rotorBodies.has(bodies[t]);
    const output = moving ? rotor : stator;
    const at = moving ? rotorAt : statorAt;

    for (let k = 0; k < 9; k++) output[at + k] = positions[t * 9 + k];

    if (moving) rotorAt += 9;
    else statorAt += 9;
  }

  return { stator: new ShapeSolid(stator), rotor: new ShapeSolid(rotor) };
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
    rotor.size && rotor.size < new Set(bodies).size ? partitionTriangles(solid.positions, bodies, rotor) : null;

  splitCache.set(solid, split);

  return split;
}
