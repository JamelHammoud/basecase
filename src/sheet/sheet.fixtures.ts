import * as THREE from 'three';

export interface Hole {
  x: number;
  y: number;
  r: number;
}

const SEGMENTS = 24;

function shapeOf(width: number, height: number, holes: Hole[]) {
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(width, 0),
    new THREE.Vector2(width, height),
    new THREE.Vector2(0, height),
  ]);

  for (const h of holes) shape.holes.push(new THREE.Path().absarc(h.x, h.y, h.r, 0, Math.PI * 2, true));

  return shape;
}

function extruded(shape: THREE.Shape, depth: number, lift = 0): Float32Array {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: SEGMENTS });

  geometry.translate(0, 0, lift);

  return geometry.attributes.position.array as Float32Array;
}

export const plateTriangles = (o: { width: number; height: number; thickness: number; holes?: Hole[] }) =>
  extruded(shapeOf(o.width, o.height, o.holes ?? []), o.thickness);

export const FOUR_HOLES: Hole[] = [
  { x: 6, y: 6, r: 1.6 },
  { x: 54, y: 6, r: 1.6 },
  { x: 6, y: 34, r: 1.6 },
  { x: 54, y: 34, r: 1.6 },
];

export function pocketedBoxTriangles(): Float32Array {
  const floor = extruded(shapeOf(40, 40, []), 5);
  const ring = shapeOf(40, 40, []);

  ring.holes.push(
    new THREE.Path([
      new THREE.Vector2(10, 10),
      new THREE.Vector2(10, 30),
      new THREE.Vector2(30, 30),
      new THREE.Vector2(30, 10),
    ]),
  );

  const walls = extruded(ring, 5, 5);
  const out = new Float32Array(floor.length + walls.length);

  out.set(floor);
  out.set(walls, floor.length);

  return out;
}

export function turned(triangles: Float32Array, euler: THREE.Euler, offset: THREE.Vector3): Float32Array {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(triangles.slice(), 3));
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(euler).setPosition(offset));

  return geometry.attributes.position.array as Float32Array;
}
