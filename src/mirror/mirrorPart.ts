import { eulerToMatrix, matrixToEuler } from '../agent/agentFrame';
import { isBooleanPart, type BooleanPart } from '../booleans/parts';
import type { CustomModelSubNode, PartKind, ScenePart } from '../types/robotics';
import { mirrorCad, mirrorContour, mirrorDeformers, mirrorMesh, mirrorSculpt } from './mirrorGeometry';
import { localMirrorAxis, mirrorByDatum } from './mirrorDatum';
import { flipAxis, flipMatrix, reflectPoint, type MirrorAxis, type MirrorPlane, type V3 } from './plane';

const ALL_AXES: MirrorAxis[] = [0, 1, 2];

const SYMMETRIC_AXES: Partial<Record<PartKind, MirrorAxis[]>> = {
  cone: [0, 2],
  pyramid: [0, 2],
  dome: [0, 2],
  wedge: [2],
};

export const isCatalogPart = (part: Pick<ScenePart, 'kind'>) => part.kind === 'component' || part.kind === 'hardware';

export function symmetricAxis(axes: MirrorAxis[], rotation: V3, k: MirrorAxis): MirrorAxis {
  if (axes.includes(k)) return k;

  const local = localMirrorAxis(rotation, k);

  return [...axes].sort((a, b) => Math.abs(local[b]) - Math.abs(local[a]))[0];
}

export function mirroredRotation(rotation: V3, k: MirrorAxis, f: MirrorAxis = k): V3 {
  return matrixToEuler(flipMatrix(k).multiply(eulerToMatrix(rotation)).multiply(flipMatrix(f)));
}

const carriesGeometry = (part: ScenePart) =>
  (part.kind === 'cad_part' && !!part.cad) ||
  (part.kind === 'mesh' && !!part.mesh) ||
  (part.kind === 'custom_model' && !!part.customNodes?.length) ||
  (part.sculptMesh?.positions.length ?? 0) >= 9;

function localAxis(part: ScenePart, k: MirrorAxis): MirrorAxis {
  if (carriesGeometry(part)) return k;

  return symmetricAxis(SYMMETRIC_AXES[part.kind] ?? ALL_AXES, part.rotation, k);
}

const NODE_AXES: Record<CustomModelSubNode['nodeType'], MirrorAxis[] | null> = {
  primitive: null,
  lathe: [0, 2],
  contour_extrude: ALL_AXES,
  sculpt_mesh: ALL_AXES,
};

function mirrorNode(node: CustomModelSubNode, k: MirrorAxis): CustomModelSubNode {
  const axes = NODE_AXES[node.nodeType] ?? SYMMETRIC_AXES[node.primitiveKind ?? 'box'] ?? ALL_AXES;
  const f = symmetricAxis(axes, node.rotation, k);
  const out = {
    ...node,
    position: flipAxis(node.position, k),
    rotation: mirroredRotation(node.rotation, k, f),
    deformers: mirrorDeformers(node.deformers),
  };

  if (node.contour) out.contour = mirrorContour(node.contour, f);

  if (node.sculptMesh) out.sculptMesh = mirrorSculpt(node.sculptMesh, f);

  return out;
}

function withLocalGeometry(part: ScenePart, k: MirrorAxis): Partial<ScenePart> {
  const out: Partial<ScenePart> = {};

  if (part.kind === 'cad_part' && part.cad) out.cad = mirrorCad(part.cad, k);

  if (part.kind === 'mesh' && part.mesh) out.mesh = mirrorMesh(part.mesh, k);

  if (part.sculptMesh) out.sculptMesh = mirrorSculpt(part.sculptMesh, k);

  if (part.customNodes) out.customNodes = part.customNodes.map((n) => mirrorNode(n, k));

  if (part.deformers?.twistDeg) out.deformers = mirrorDeformers(part.deformers);

  if (part.com) out.com = flipAxis(part.com, k);

  return out;
}

function mirrorBoolean(part: BooleanPart, plane: MirrorPlane): ScenePart {
  const operands = part.boolean.operands.map((o) => mirrorPart(o, plane));
  const out: ScenePart = {
    ...part,
    position: operands[0].position,
    rotation: operands[0].rotation,
    boolean: { ...part.boolean, operands },
  };

  delete out.boolean!.frame;
  delete out.mesh;
  delete out.csg;

  return out;
}

export function mirrorPart(part: ScenePart, plane: MirrorPlane): ScenePart {
  if (isCatalogPart(part)) return { ...part, ...mirrorByDatum(part, plane) };

  if (isBooleanPart(part)) return mirrorBoolean(part, plane);

  const k = plane.axis;
  const f = localAxis(part, k);

  return {
    ...part,
    position: reflectPoint(part.position, plane),
    rotation: mirroredRotation(part.rotation, k, f),
    ...withLocalGeometry(part, f),
  };
}
