import type { Port } from '../types/ports';
import type { CustomModelSubNode, PartDeformers, ScenePart, SculptMeshData } from '../types/robotics';
import { mirrorCode } from '../agent/cadCode';
import { flipAxis, type MirrorAxis } from './plane';

const CODE_AXIS: Record<MirrorAxis, MirrorAxis> = { 0: 0, 1: 2, 2: 1 };

function flipPorts(ports: Port[] | undefined, c: number): Port[] | undefined {
  return ports?.map((p) => ({
    ...p,
    position: flipAxis(p.position, c),
    axis: flipAxis(p.axis, c),
    ...(p.ref ? { ref: flipAxis(p.ref, c) } : {}),
  }));
}

function flipped(values: number[], k: number): number[] {
  const out = values.slice();

  for (let i = k; i < out.length; i += 3) out[i] = -out[i];

  return out;
}

function rewound(indices: number[]): number[] {
  const out = indices.slice();

  for (let i = 0; i < out.length; i += 3) [out[i + 1], out[i + 2]] = [out[i + 2], out[i + 1]];

  return out;
}

function rewoundSoup(positions: number[]): number[] {
  const out = positions.slice();

  for (let t = 0; t + 8 < out.length; t += 9)
    for (let c = 0; c < 3; c++) [out[t + 3 + c], out[t + 6 + c]] = [out[t + 6 + c], out[t + 3 + c]];

  return out;
}

export function mirrorCad(cad: NonNullable<ScenePart['cad']>, k: MirrorAxis): NonNullable<ScenePart['cad']> {
  const edges = cad.edges ? flipped(cad.edges, k) : null;
  const c = CODE_AXIS[k];
  const ports = flipPorts(cad.ports, c);

  return {
    ...cad,
    code: mirrorCode(cad.language, cad.code, c),
    positions: flipped(cad.positions, k),
    indices: rewound(cad.indices),
    edges,
    originOffset: flipAxis(cad.originOffset, k),
    ...(ports ? { ports } : {}),
  };
}

export function mirrorMesh(mesh: NonNullable<ScenePart['mesh']>, k: MirrorAxis): NonNullable<ScenePart['mesh']> {
  const positions = flipped(mesh.positions, k);
  const out = mesh.indices.length
    ? { ...mesh, positions, indices: rewound(mesh.indices) }
    : { ...mesh, positions: rewoundSoup(positions) };

  delete out.visual;

  return out;
}

export function mirrorSculpt(sculpt: SculptMeshData, k: MirrorAxis): SculptMeshData {
  const positions = flipped(sculpt.positions, k);

  if (!sculpt.indices?.length) return { ...sculpt, positions: rewoundSoup(positions) };

  return { ...sculpt, positions, indices: rewound(sculpt.indices) };
}

export function mirrorDeformers(deformers: PartDeformers | undefined): PartDeformers | undefined {
  if (!deformers?.twistDeg) return deformers;

  return { ...deformers, twistDeg: -deformers.twistDeg };
}

type Loop = Array<[number, number]>;

const flipLoop = (loop: Loop, k: MirrorAxis): Loop => loop.map(([x, z]) => (k === 0 ? [-x, z] : [x, -z]));

export function mirrorContour(contour: NonNullable<CustomModelSubNode['contour']>, k: MirrorAxis) {
  if (k === 1) return contour;

  return { ...contour, outerLoop: flipLoop(contour.outerLoop, k), holes: contour.holes?.map((h) => flipLoop(h, k)) };
}
