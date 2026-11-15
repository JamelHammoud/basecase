import { BoxGeometry, Matrix4 } from 'three';
import type { WorldImportFile } from './worldImportTypes';

type Point = [number, number, number];

interface Box {
  at: Point;
  size: Point;
  tilt?: number;
}

function objBoxes(name: string, boxes: Box[]): WorldImportFile {
  const lines: string[] = [];
  let offset = 1;

  for (const [i, box] of boxes.entries()) {
    const geometry = new BoxGeometry(...box.size);
    const matrix = new Matrix4().makeRotationX(box.tilt ?? 0);

    matrix.setPosition(...box.at);
    geometry.applyMatrix4(matrix);

    const positions = geometry.getAttribute('position');
    const indices = geometry.index!;

    lines.push(`o piece-${i}`);

    for (let j = 0; j < positions.count; j++)
      lines.push(`v ${positions.getX(j)} ${positions.getY(j)} ${positions.getZ(j)} 0.4 0.5 0.3`);

    for (let j = 0; j < indices.count; j += 3)
      lines.push(`f ${indices.getX(j) + offset} ${indices.getX(j + 1) + offset} ${indices.getX(j + 2) + offset}`);

    offset += positions.count;
    geometry.dispose();
  }

  return { name, bytes: new TextEncoder().encode(lines.join('\n')) };
}

const floor: Box = { at: [0, -0.05, 0], size: [6, 0.1, 6] };

export const KITCHEN_TABLE_CENTER_M: Point = [0, 0.75, 1.2];

export function kitchenCollider(): WorldImportFile {
  const legs = [-0.7, 0.7].flatMap((x) => [0.7, 1.7].map((z): Box => ({ at: [x, 0.35, z], size: [0.08, 0.7, 0.08] })));

  return objBoxes('Kitchen.obj', [
    floor,
    { at: KITCHEN_TABLE_CENTER_M, size: [1.6, 0.1, 1.2] },
    ...legs,
    { at: [-2.5, 0.5, 0], size: [0.5, 1, 4] },
    { at: [2.5, 1, 0], size: [0.1, 2, 6] },
  ]);
}

export function yardCollider(): WorldImportFile {
  const angle = (5 * Math.PI) / 180;
  const height = 1.5 * Math.sin(angle) - 0.05 * Math.cos(angle);

  return objBoxes('Yard.obj', [floor, { at: [0, height, 1.5], size: [2, 0.1, 3], tilt: -angle }]);
}

export function stairwellCollider(): WorldImportFile {
  const steps = Array.from({ length: 6 }, (_, i): Box => ({
    at: [0, ((i + 1) * 0.04) / 2, 0.6 + i * 0.25],
    size: [1.8, (i + 1) * 0.04, 0.25],
  }));

  return objBoxes('Stairwell.obj', [floor, ...steps]);
}

function kitchenPoint(index: number): Point {
  const u = (index * 0.61803398875) % 1;
  const v = (index * 0.41421356237) % 1;
  const surfaces: Point[] = [
    [u * 6 - 3, 0.01, v * 6 - 3],
    [u * 1.6 - 0.8, 0.81, v * 1.2 + 0.6],
    [2.44, u * 2, v * 6 - 3],
    [-2.24, u, v * 4 - 2],
    [(index % 4 < 2 ? -1 : 1) * 0.7, u * 0.7, index % 2 ? 0.7 : 1.7],
  ];

  return surfaces[index % surfaces.length];
}

export function kitchenSplat(count = 8192): WorldImportFile {
  const fields = [
    'x',
    'y',
    'z',
    'scale_0',
    'scale_1',
    'scale_2',
    'rot_0',
    'rot_1',
    'rot_2',
    'rot_3',
    'opacity',
    'f_dc_0',
    'f_dc_1',
    'f_dc_2',
  ];
  const header = new TextEncoder().encode(
    [
      'ply',
      'format binary_little_endian 1.0',
      `element vertex ${count}`,
      ...fields.map((field) => `property float ${field}`),
      'end_header',
      '',
    ].join('\n'),
  );
  const bytes = new Uint8Array(header.length + count * fields.length * 4);
  const values = new DataView(bytes.buffer, header.length);
  const scale = count > 10_000 ? -5 : -2.5;

  bytes.set(header);

  for (let i = 0; i < count; i++) {
    const record = [...kitchenPoint(i), scale, scale, scale, 1, 0, 0, 0, 4, 0.3, 0.1, -0.1];

    record.forEach((value, j) => values.setFloat32((i * fields.length + j) * 4, value, true));
  }

  return { name: 'Kitchen.ply', bytes };
}
