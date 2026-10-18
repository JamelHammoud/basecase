import * as THREE from 'three';
import type { CustomModelSubNode, PartRole, ScenePart } from '../../types/robotics';
import { applyDeformersToBufferGeometry, buildBufferGeometryFromSculptData } from '../sculptAndBooleanEngine';
import { makeSubMesh, type BuildContext } from './context';
import { createMaterial } from './materials';
import type { PartBuilder } from './primitives';

export type GroupBuilder = (part: ScenePart, selected: boolean) => THREE.Group;

interface NodeStyle {
  role: PartRole;
  selected: boolean;
  material: THREE.Material;
}

const placeNode = (object: THREE.Object3D, node: CustomModelSubNode) => {
  object.position.set(node.position[0], node.position[1], node.position[2]);
  object.rotation.set(
    THREE.MathUtils.degToRad(node.rotation[0]),
    THREE.MathUtils.degToRad(node.rotation[1]),
    THREE.MathUtils.degToRad(node.rotation[2]),
  );

  return object;
};

const deformNode = (geometry: THREE.BufferGeometry, node: CustomModelSubNode) => {
  if (node.deformers) applyDeformersToBufferGeometry(geometry, node.deformers);

  return geometry;
};

const loopShape = (loop: Array<[number, number]>, w: number, d: number, path: THREE.Path) => {
  loop.forEach(([nx, nz], idx) => {
    if (idx === 0) path.moveTo(nx * w, nz * d);
    else path.lineTo(nx * w, nz * d);
  });
  path.closePath();

  return path;
};

const sculptNode = (node: CustomModelSubNode, style: NodeStyle) => {
  const { width: w, height: h, depth: d } = node.dimensions;
  const geometry = deformNode(buildBufferGeometryFromSculptData(node.sculptMesh!, w, h, d), node);
  const mesh = makeSubMesh(geometry, style.material, { ...style, edgeThreshold: 34 });

  mesh.userData.isSculptTarget = true;

  return placeNode(mesh, node);
};

const contourNode = (node: CustomModelSubNode, style: NodeStyle) => {
  const { width: w, height: h, depth: d } = node.dimensions;
  const contour = node.contour!;
  const shape = loopShape(contour.outerLoop, w, d, new THREE.Shape()) as THREE.Shape;

  for (const hole of contour.holes ?? []) {
    if (hole.length >= 3) shape.holes.push(loopShape(hole, w, d, new THREE.Path()));
  }

  const extrudeDepth = Math.max(1, h);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeDepth,
    steps: 8,
    bevelEnabled: Boolean(contour.bevel),
    bevelThickness: Math.min(1.2, extrudeDepth * 0.08),
    bevelSize: Math.min(1.0, Math.min(w, d) * 0.03),
    bevelSegments: 2,
    curveSegments: 20,
  });

  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, extrudeDepth / 2, 0);

  return placeNode(makeSubMesh(deformNode(geometry, node), style.material, style), node);
};

const latheNode = (node: CustomModelSubNode, style: NodeStyle) => {
  const { width: w, height: h, depth: d } = node.dimensions;
  const maxR = Math.min(w, d);
  const points = node.lathe!.profilePoints.map(([r, y]) => new THREE.Vector2(Math.max(0.5, r * maxR), y * h));
  const geometry = new THREE.LatheGeometry(points, node.lathe!.segments || 32);

  geometry.center();

  return placeNode(makeSubMesh(deformNode(geometry, node), style.material, style), node);
};

const primitiveNode = (node: CustomModelSubNode, role: PartRole, selected: boolean, build: GroupBuilder) =>
  build(
    {
      id: node.id,
      name: node.name,
      kind: node.primitiveKind || 'box',
      category: 'primitives',
      role,
      position: node.position,
      rotation: node.rotation,
      dimensions: node.dimensions,
      color: node.color,
      note: '',
      visible: true,
      locked: false,
      deformers: node.deformers,
    },
    selected,
  );

function buildCustomSubNode(
  node: CustomModelSubNode,
  parent: Omit<NodeStyle, 'material'>,
  build: GroupBuilder,
): THREE.Object3D {
  const role = parent.role === 'cutout' ? 'cutout' : node.role;
  const style = {
    role,
    selected: parent.selected,
    material: createMaterial({ color: node.color, role, selected: parent.selected }),
  };

  if (node.nodeType === 'sculpt_mesh' && node.sculptMesh) {
    return sculptNode(node, style);
  }

  if (node.nodeType === 'contour_extrude' && node.contour && node.contour.outerLoop.length >= 3) {
    return contourNode(node, style);
  }

  if (node.nodeType === 'lathe' && node.lathe && node.lathe.profilePoints.length >= 2) {
    return latheNode(node, style);
  }

  return primitiveNode(node, role, parent.selected, build);
}

const isAtOrigin = (n: CustomModelSubNode) =>
  n.nodeType === 'contour_extrude' && n.position[0] === 0 && n.position[1] === 0 && n.position[2] === 0;

const SINGLE_FIT_TYPES = new Set(['contour_extrude', 'lathe', 'sculpt_mesh']);

const fitToPart = (container: THREE.Group, ctx: BuildContext) => {
  const size = new THREE.Box3().setFromObject(container).getSize(new THREE.Vector3());
  const ratio = (target: number, actual: number) => (actual > 0.1 ? target / actual : 1);

  container.scale.set(ratio(ctx.width, size.x), ratio(ctx.height, size.y), ratio(ctx.depth, size.z));
};

export const customModelBuilder =
  (build: GroupBuilder): PartBuilder =>
  (ctx) => {
    const { part } = ctx;
    const nodes = part.customNodes ?? [];

    if (nodes.length === 0) {
      ctx.add(ctx.deform(new THREE.BoxGeometry(ctx.width, ctx.height, ctx.depth, 12, 16, 12)));

      return;
    }

    const container = new THREE.Group();
    const allAtOrigin = nodes.every(isAtOrigin);
    const parent = { role: part.role, selected: ctx.selected };

    for (const node of nodes) {
      const fills = allAtOrigin || (nodes.length === 1 && SINGLE_FIT_TYPES.has(node.nodeType));
      const sized: CustomModelSubNode = fills
        ? {
            ...node,
            dimensions: { width: ctx.width, height: ctx.height, depth: ctx.depth },
            color: part.color || node.color,
            deformers: part.deformers || node.deformers,
          }
        : node;

      container.add(buildCustomSubNode(sized, parent, build));
    }

    if (nodes.length > 1 && !allAtOrigin) fitToPart(container, ctx);

    ctx.group.add(container);
  };

export const sculptFallback: PartBuilder = (ctx) => {
  const geometry = new THREE.IcosahedronGeometry(0.5, 4);

  geometry.scale(ctx.width, ctx.height, ctx.depth);
  ctx.add(ctx.deform(geometry), undefined, 35).userData.isSculptTarget = true;
};

export const sculptedPart: PartBuilder = (ctx) => {
  const sculpt = ctx.part.sculptMesh!;
  const geometry = buildBufferGeometryFromSculptData(sculpt, ctx.width, ctx.height, ctx.depth);

  ctx.add(ctx.deform(geometry), undefined, 35).userData.isSculptTarget = true;
};
