import { Box3, BufferAttribute, ExtrudeGeometry, Matrix4, Path, Shape, Vector3 } from 'three';
import type { ScenePart } from '../types/robotics';
import { sheetPart, pocketTriangles } from './sheet.fixtures';
import type { DrawingPoint } from './drawingTypes';
import { kitFixture } from '../kit/kit.fixtures';

interface ProfileCase {
  name: string;
  outline: DrawingPoint[];
  centers: DrawingPoint[];
  thickness: number;
  radius?: number;
  mirrored?: boolean;
}

const rectangle = (w: number, h: number): DrawingPoint[] => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];
const round = (radius: number, center: DrawingPoint = [radius, radius]): DrawingPoint[] =>
  Array.from({ length: 64 }, (_, i) => [
    center[0] + radius * Math.cos((i * Math.PI) / 32),
    center[1] + radius * Math.sin((i * Math.PI) / 32),
  ]);

export const DRAWING_DESIGNS: ProfileCase[] = [
  {
    name: 'Rover deck',
    outline: rectangle(80, 60),
    centers: [
      [10, 10],
      [70, 10],
      [10, 50],
      [30, 50],
    ],
    thickness: 3,
  },
  {
    name: 'Arm pedestal',
    outline: rectangle(50, 50),
    centers: [
      [10, 10],
      [40, 10],
      [10, 40],
      [40, 40],
    ],
    thickness: 8,
    radius: 3,
  },
  {
    name: 'Quadruped hip bracket',
    outline: [
      [0, 0],
      [60, 0],
      [60, 15],
      [20, 15],
      [20, 45],
      [0, 45],
    ],
    centers: [
      [10, 10],
      [50, 7],
      [10, 35],
    ],
    thickness: 4,
  },
  {
    name: 'Hexapod electronics plate',
    outline: [
      [0, 20],
      [20, 0],
      [70, 0],
      [90, 20],
      [70, 60],
      [20, 60],
    ],
    centers: [
      [20, 20],
      [70, 20],
      [30, 45],
      [60, 45],
    ],
    thickness: 2,
  },
  {
    name: 'Pan-tilt camera mount',
    outline: [
      [0, 0],
      [60, 0],
      [60, 45],
      [45, 45],
      [45, 15],
      [15, 15],
      [15, 45],
      [0, 45],
    ],
    centers: [
      [7, 30],
      [53, 30],
      [30, 7],
    ],
    thickness: 3,
    mirrored: true,
  },
  {
    name: 'Gripper jaw',
    outline: [
      [0, 0],
      [50, 0],
      [50, 12],
      [35, 12],
      [35, 20],
      [0, 20],
    ],
    centers: [
      [8, 10],
      [25, 10],
    ],
    thickness: 6,
  },
  { name: 'Sensor enclosure lid', outline: rectangle(80, 60), centers: [], thickness: 3 },
  {
    name: 'Wheel flange',
    outline: round(25),
    centers: [
      [25, 25],
      [10, 25],
      [40, 25],
      [25, 10],
      [25, 40],
    ],
    thickness: 5,
  },
  {
    name: 'Linkage bar',
    outline: [
      [0, 0],
      [70, 0],
      [70, 15],
      [0, 15],
    ],
    centers: [
      [7.5, 7.5],
      [62.5, 7.5],
    ],
    thickness: 4,
    radius: 2.5,
  },
  {
    name: 'Appliance service panel',
    outline: [
      [0, 0],
      [120, 0],
      [120, 70],
      [80, 70],
      [80, 60],
      [40, 60],
      [40, 70],
      [0, 70],
    ],
    centers: [
      [8, 8],
      [112, 8],
      [8, 62],
      [112, 62],
    ],
    thickness: 1.6,
  },
];

function profileTriangles(spec: ProfileCase): Float32Array {
  const shape = new Shape();

  spec.outline.forEach(([x, y], index) => (index ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();

  for (const [x, y] of spec.centers) {
    const hole = new Path();

    hole.absarc(x, y, spec.radius ?? 2, 0, 2 * Math.PI, true);
    shape.holes.push(hole);
  }

  const geometry = new ExtrudeGeometry(shape, { depth: spec.thickness, bevelEnabled: false, curveSegments: 24 });
  const positions = (geometry.getAttribute('position').array as Float32Array).slice();

  geometry.dispose();

  return positions;
}

export function drawingDesign(index: number): ScenePart {
  const spec = DRAWING_DESIGNS[index];
  const positions = index === 6 ? pocketTriangles() : profileTriangles(spec);
  const box = new Box3().setFromBufferAttribute(new BufferAttribute(positions, 3));
  const [width, height, depth] = box.getSize(new Vector3()).toArray();

  return sheetPart({
    id: `fabricated-${index}`,
    name: spec.name,
    kind: index === 2 ? 'boolean' : 'mesh',
    dimensions: { width, height, depth },
    rotation: [index * 9, index * 7, index * 3],
    mesh: {
      positions: Array.from(positions),
      indices: Array.from({ length: positions.length / 3 }, (_, i) => i),
      baseSize: [width, height, depth],
      file: `${spec.name}.stl`,
    },
    ...(spec.mirrored ? { sheetTransform: new Matrix4().makeScale(-1, 1, 1).toArray() } : {}),
  });
}

export function drawingRover() {
  const source = kitFixture('differential rover');
  const body = source.parts[0];
  const plate = drawingDesign(0);

  return {
    name: 'Workshop rover',
    parts: source.parts.map((part) =>
      part === body
        ? { ...plate, id: body.id, rotation: [0, 0, 0] as [number, number, number], position: body.position }
        : part,
    ),
    project: { ...source.project, labelParts: false },
  };
}
