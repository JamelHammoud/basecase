import { BufferAttribute, BufferGeometry, ExtrudeGeometry, Path, Shape, Vector2, Vector3 } from 'three';
import type { ScenePart } from '../../types/robotics';
import { cadParts } from '../../workspace/cadImport';
import { meshPartsFromFile } from '../../workspace/meshImport';
import { binaryStl } from '../stlBytes';
import type { Vec2 } from './types';

const rectangle = (w: number, h: number): Vec2[] => [
  [-w / 2, -h / 2],
  [w / 2, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
];
const circle = (x: number, y: number, r: number, count = 12): Vec2[] =>
  Array.from({ length: count }, (_, i) => [
    x + r * Math.cos((i * Math.PI * 2) / count),
    y + r * Math.sin((i * Math.PI * 2) / count),
  ]);
const mounting = (w: number, h: number) =>
  [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ].map(([x, y]) => circle(x, y, 2));
const slot = (x: number, y: number, w: number, h: number): Vec2[] => rectangle(w, h).map(([a, b]) => [x + a, y + b]);

export const RECOVERY_DESIGNS = [
  { name: 'Rectangular mounting plate', outer: rectangle(80, 60), holes: mounting(30, 20), depth: 3 },
  {
    name: 'Concave electronics deck',
    outer: [
      [-50, -40],
      [50, -40],
      [50, 0],
      [0, 0],
      [0, 40],
      [-50, 40],
    ] as Vec2[],
    holes: [circle(-30, -20, 3), circle(30, -20, 3), circle(-30, 20, 3)],
    depth: 2,
  },
  {
    name: 'Servo side plate',
    outer: [
      [-32, -20],
      [32, -20],
      [32, 10],
      [20, 10],
      [20, 20],
      [-32, 20],
    ] as Vec2[],
    holes: [slot(-16, 0, 4, 18), slot(8, 0, 4, 18)],
    depth: 3,
  },
  {
    name: 'Bearing mounting plate',
    outer: rectangle(60, 60),
    holes: [circle(0, 0, 8, 24), ...mounting(20, 20)],
    depth: 4,
  },
  {
    name: 'Slotted sensor plate',
    outer: rectangle(80, 30),
    holes: [slot(0, 0, 36, 4), circle(-30, 0, 2), circle(30, 0, 2)],
    depth: 0.2,
  },
  { name: 'Annular spacer', outer: circle(0, 0, 20, 32), holes: [circle(0, 0, 12, 24)], depth: 1.5 },
  {
    name: 'Polygonal gripper blank',
    outer: [
      [-35, -12],
      [25, -12],
      [35, -4],
      [35, 4],
      [25, 12],
      [-35, 12],
    ] as Vec2[],
    holes: [circle(-24, 0, 2), circle(-12, 0, 2)],
    depth: 6,
  },
  {
    name: 'Conveyor side plate',
    outer: [
      [-70, -22],
      [70, -22],
      [70, 10],
      [50, 22],
      [-50, 22],
      [-70, 10],
    ] as Vec2[],
    holes: [-50, -30, -10, 10, 30, 50].map((x) => circle(x, 0, 3)),
    depth: 3,
  },
  {
    name: 'Asymmetric camera plate',
    outer: [
      [-40, -30],
      [30, -30],
      [40, -10],
      [20, 30],
      [-20, 30],
      [-40, 10],
    ] as Vec2[],
    holes: [slot(-20, 0, 4, 18), circle(10, -14, 3), circle(6, 16, 2)],
    depth: 2,
  },
  {
    name: 'Repeated-hole chassis deck',
    outer: rectangle(160, 100),
    holes: Array.from({ length: 20 }, (_, i) => circle(-60 + (i % 5) * 30, -30 + Math.floor(i / 5) * 20, 2, 8)),
    depth: 3,
  },
];

export function recoveryTriangles(index: number): Float32Array {
  const design = RECOVERY_DESIGNS[index];
  const shape = new Shape(design.outer.map(([x, y]) => new Vector2(x, y)));

  shape.holes = design.holes.map((loop) => new Path(loop.map(([x, y]) => new Vector2(x, y))));

  const geometry = new ExtrudeGeometry(shape, { depth: design.depth, bevelEnabled: false, steps: (index % 3) + 1 });
  const triangles = (geometry.getAttribute('position').array as Float32Array).slice();

  geometry.dispose();

  return triangles;
}

export function stepDerivedPart(soup: Float32Array, id = 'plate'): ScenePart {
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(soup.slice(), 3));

  geometry.computeBoundingBox();

  const center = geometry.boundingBox!.getCenter(new Vector3());
  const size = geometry.boundingBox!.getSize(new Vector3()).toArray();

  geometry.translate(-center.x, -center.y, -center.z);

  const positions = geometry.getAttribute('position').array as Float32Array;
  const indices = Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
  const data = new Uint8Array(positions.byteLength + indices.byteLength);

  data.set(new Uint8Array(positions.buffer));
  data.set(new Uint8Array(indices.buffer), positions.byteLength);
  geometry.dispose();

  return cadParts(
    {
      bodies: [
        {
          name: 'Plate',
          vertices: positions.length / 3,
          triangles: indices.length / 3,
          center: [0, 0, 0],
          size,
          color: '#777777',
        },
      ],
      data,
    },
    { name: 'Plate', file: 'plate.step', newId: () => id },
  )[0];
}

export async function recoveryImportedPart(index: number) {
  const soup = recoveryTriangles(index);
  const id = `plate-${index}`;
  const part =
    index % 2
      ? stepDerivedPart(soup, id)
      : (
          await meshPartsFromFile({ file: new File([Uint8Array.from(binaryStl(soup))], 'plate.stl'), newId: () => id })
        )[0];

  return {
    ...part,
    name: RECOVERY_DESIGNS[index].name,
    position: [23, 31, -47] as [number, number, number],
    rotation: [13, 29, -17] as [number, number, number],
    group: { id: 'assembly', name: 'Assembly' },
    printMaterial: 'PETG' as const,
  };
}
