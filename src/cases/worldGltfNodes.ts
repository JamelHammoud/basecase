import { damaged, finiteList, listOf, recordOf, wholeOf, wholeOr } from './worldRead';

export type Mat4 = number[];

export interface MeshInstance {
  mesh: number;
  matrix: Mat4;
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const MAX_NODE_VISITS = 100_000;

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);

  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }

  return out;
}

export const transformPoint = (m: Mat4, [x, y, z]: number[]): [number, number, number] => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

function composed(node: Record<string, unknown>, name: string): Mat4 {
  const [tx, ty, tz] = node.translation === undefined ? [0, 0, 0] : finiteList(node.translation, 3, name);
  const [x, y, z, w] = node.rotation === undefined ? [0, 0, 0, 1] : finiteList(node.rotation, 4, name);
  const [sx, sy, sz] = node.scale === undefined ? [1, 1, 1] : finiteList(node.scale, 3, name);
  const [xx, yy, zz, xy, xz, yz, wx, wy, wz] = [x * x, y * y, z * z, x * y, x * z, y * z, w * x, w * y, w * z];

  return [
    (1 - 2 * (yy + zz)) * sx,
    2 * (xy + wz) * sx,
    2 * (xz - wy) * sx,
    0,
    2 * (xy - wz) * sy,
    (1 - 2 * (xx + zz)) * sy,
    2 * (yz + wx) * sy,
    0,
    2 * (xz + wy) * sz,
    2 * (yz - wx) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

const localMatrix = (node: Record<string, unknown>, name: string): Mat4 =>
  node.matrix === undefined ? composed(node, name) : finiteList(node.matrix, 16, name);

function rootNodes(json: Record<string, unknown>, name: string): number[] {
  const scenes = listOf(json.scenes, name);
  const nodes = listOf(json.nodes, name);

  if (scenes.length) {
    const scene = recordOf(scenes[wholeOr(json.scene, 0, name)] ?? damaged(name), name);

    return listOf(scene.nodes, name).map((n) => wholeOf(n, name));
  }

  const children = new Set(nodes.flatMap((n) => listOf(recordOf(n, name).children, name)));

  return nodes.map((_, i) => i).filter((i) => !children.has(i));
}

export function meshInstances(json: Record<string, unknown>, name: string): MeshInstance[] {
  const nodes = listOf(json.nodes, name);
  const stack = rootNodes(json, name).map((node) => ({ node, parent: IDENTITY }));
  const out: MeshInstance[] = [];
  let visits = 0;

  if (!nodes.length) return listOf(json.meshes, name).map((_, mesh) => ({ mesh, matrix: IDENTITY }));

  while (stack.length) {
    const { node: index, parent } = stack.pop()!;
    const node = recordOf(nodes[index] ?? damaged(name), name);
    const matrix = multiply(parent, localMatrix(node, name));

    if (++visits > MAX_NODE_VISITS) damaged(name);

    if (node.mesh !== undefined) out.push({ mesh: wholeOf(node.mesh, name), matrix });

    for (const child of listOf(node.children, name)) stack.push({ node: wholeOf(child, name), parent: matrix });
  }

  return out;
}
