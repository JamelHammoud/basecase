import * as THREE from 'three';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ScenePart, SculptMeshData } from '../types/robotics';

export { applyDeformersToBufferGeometry } from './sculptDeformers';

export function weldAndNormalizeGeometry(rawGeo: THREE.BufferGeometry): SculptMeshData {
  const clean = rawGeo.clone();

  clean.deleteAttribute('uv');
  clean.deleteAttribute('normal');

  const welded = mergeVertices(clean, 1e-3);

  welded.computeBoundingBox();

  const box = welded.boundingBox!;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  const posAttr = welded.getAttribute('position') as THREE.BufferAttribute;
  const positions: number[] = [];
  const sx = size.x > 1e-4 ? size.x : 1;
  const sy = size.y > 1e-4 ? size.y : 1;
  const sz = size.z > 1e-4 ? size.z : 1;

  for (let i = 0; i < posAttr.count; i++) {
    positions.push(
      Math.round(((posAttr.getX(i) - center.x) / sx) * 10000) / 10000,
      Math.round(((posAttr.getY(i) - center.y) / sy) * 10000) / 10000,
      Math.round(((posAttr.getZ(i) - center.z) / sz) * 10000) / 10000,
    );
  }

  const indexAttr = welded.getIndex();
  const indices: number[] = [];

  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i++) {
      indices.push(indexAttr.getX(i));
    }
  }

  return { positions, indices };
}

export function tessellateGeometryForSculpting(geo: THREE.BufferGeometry, passes = 2): THREE.BufferGeometry {
  let current = geo.index ? geo.toNonIndexed() : geo.clone();

  for (let p = 0; p < passes; p++) {
    const pos = current.getAttribute('position') as THREE.BufferAttribute;
    const triCount = pos.count / 3;

    if (triCount > 8000) break;

    const newCoords: number[] = [];
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const mAB = new THREE.Vector3();
    const mBC = new THREE.Vector3();
    const mCA = new THREE.Vector3();

    for (let t = 0; t < triCount; t++) {
      const i0 = t * 3;

      vA.fromBufferAttribute(pos, i0);
      vB.fromBufferAttribute(pos, i0 + 1);
      vC.fromBufferAttribute(pos, i0 + 2);

      mAB.addVectors(vA, vB).multiplyScalar(0.5);
      mBC.addVectors(vB, vC).multiplyScalar(0.5);
      mCA.addVectors(vC, vA).multiplyScalar(0.5);

      newCoords.push(
        vA.x,
        vA.y,
        vA.z,
        mAB.x,
        mAB.y,
        mAB.z,
        mCA.x,
        mCA.y,
        mCA.z,
        mAB.x,
        mAB.y,
        mAB.z,
        vB.x,
        vB.y,
        vB.z,
        mBC.x,
        mBC.y,
        mBC.z,
        mCA.x,
        mCA.y,
        mCA.z,
        mBC.x,
        mBC.y,
        mBC.z,
        vC.x,
        vC.y,
        vC.z,
        mAB.x,
        mAB.y,
        mAB.z,
        mBC.x,
        mBC.y,
        mBC.z,
        mCA.x,
        mCA.y,
        mCA.z,
      );
    }

    const nextGeo = new THREE.BufferGeometry();

    nextGeo.setAttribute('position', new THREE.Float32BufferAttribute(newCoords, 3));
    current = nextGeo;
  }

  return current;
}

export function createSculptClayPreset(
  preset: 'clay_sphere' | 'clay_box' | 'clay_cylinder' | 'clay_capsule',
): SculptMeshData {
  let geo: THREE.BufferGeometry;

  switch (preset) {
    case 'clay_box':
      geo = new THREE.BoxGeometry(1, 1, 1, 22, 22, 22);

      break;
    case 'clay_cylinder':
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 44, 24);

      break;
    case 'clay_capsule':
      geo = new THREE.CapsuleGeometry(0.35, 0.4, 20, 36);

      break;
    case 'clay_sphere':
    default:
      geo = new THREE.IcosahedronGeometry(0.5, 4);

      break;
  }

  return weldAndNormalizeGeometry(geo);
}

export function buildBufferGeometryFromSculptData(
  sculptMesh: SculptMeshData,
  width: number,
  height: number,
  depth: number,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const count = sculptMesh.positions.length / 3;
  const scaled = new Float32Array(sculptMesh.positions.length);

  for (let i = 0; i < count; i++) {
    const idx = i * 3;

    scaled[idx] = sculptMesh.positions[idx] * width;
    scaled[idx + 1] = sculptMesh.positions[idx + 1] * height;
    scaled[idx + 2] = sculptMesh.positions[idx + 2] * depth;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(scaled, 3));

  if (sculptMesh.indices && sculptMesh.indices.length > 0) {
    geo.setIndex(sculptMesh.indices);
  }

  geo.computeVertexNormals();

  return geo;
}

export function extractSculptDataFromGeometry(
  geo: THREE.BufferGeometry,
  width: number,
  height: number,
  depth: number,
): SculptMeshData {
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const positions: number[] = new Array(posAttr.count * 3);
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const d = Math.max(1, depth);

  for (let i = 0; i < posAttr.count; i++) {
    const idx = i * 3;

    positions[idx] = Math.round((posAttr.getX(i) / w) * 10000) / 10000;
    positions[idx + 1] = Math.round((posAttr.getY(i) / h) * 10000) / 10000;
    positions[idx + 2] = Math.round((posAttr.getZ(i) / d) * 10000) / 10000;
  }

  const indexAttr = geo.getIndex();
  const indices: number[] = [];

  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i++) {
      indices.push(indexAttr.getX(i));
    }
  }

  return { positions, indices };
}

export { sculptStroke, type SculptStrokeInput } from './sculptStroke';

function withSculptAttributes(geo: THREE.BufferGeometry) {
  if (!geo.getAttribute('normal')) {
    geo.computeVertexNormals();
  }

  if (geo.getAttribute('uv')) return;

  const count = geo.getAttribute('position').count;

  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
}

function buildCSGBrushFromGroup(group: THREE.Group): Brush | null {
  group.updateMatrixWorld(true);

  const evaluator = new Evaluator();

  evaluator.useGroups = false;

  const brushes: Brush[] = [];

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;

    const geoClone = child.geometry.clone();

    geoClone.applyMatrix4(child.matrixWorld);
    withSculptAttributes(geoClone);

    const b = new Brush(geoClone);

    b.updateMatrixWorld();
    brushes.push(b);
  });

  if (brushes.length === 0) return null;

  let combined = brushes[0];

  for (let i = 1; i < brushes.length; i++) {
    combined = evaluator.evaluate(combined, brushes[i], ADDITION);
  }

  return combined;
}

const CSG_OPERATIONS = { subtract: SUBTRACTION, union: ADDITION, intersect: INTERSECTION } as const;

export function runSceneBooleanCSG(
  basePart: ScenePart,
  operandParts: ScenePart[],
  operation: 'subtract' | 'union' | 'intersect',
  buildGroupFn: (part: ScenePart, isSelected: boolean) => THREE.Group,
): ScenePart | null {
  const baseGroup = buildGroupFn(basePart, false);
  let resultBrush = buildCSGBrushFromGroup(baseGroup);

  if (!resultBrush) return null;

  const evaluator = new Evaluator();

  evaluator.useGroups = false;

  const csgOp = CSG_OPERATIONS[operation];

  for (const opPart of operandParts) {
    const opGroup = buildGroupFn(opPart, false);
    const opBrush = buildCSGBrushFromGroup(opGroup);

    if (!opBrush) continue;

    resultBrush = evaluator.evaluate(resultBrush, opBrush, csgOp);
  }

  const finalGeo = resultBrush.geometry.clone();

  finalGeo.computeBoundingBox();

  const box = finalGeo.boundingBox!;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  if (size.x < 0.5 || size.y < 0.5 || size.z < 0.5) {
    return null;
  }

  const sculptMesh = weldAndNormalizeGeometry(finalGeo);

  return {
    id: `part-bool-${Date.now().toString(36)}`,
    name: operation === 'subtract' ? `${basePart.name} (Cutouts Carved)` : `${basePart.name} (Boolean Merged)`,
    kind: 'sculpt_mesh',
    category: 'custom_models',
    role: 'solid',
    position: [Math.round(center.x * 10) / 10, Math.round(center.y * 10) / 10, Math.round(center.z * 10) / 10],
    rotation: [0, 0, 0],
    dimensions: {
      width: Math.max(2, Math.round(size.x * 10) / 10),
      height: Math.max(2, Math.round(size.y * 10) / 10),
      depth: Math.max(2, Math.round(size.z * 10) / 10),
    },
    color: basePart.color,
    note: basePart.note,
    mechanicalTag: basePart.mechanicalTag || '3D Printed PLA/PETG',
    visible: true,
    locked: false,
    sculptMesh,
  };
}
