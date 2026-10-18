import * as THREE from 'three';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PartDeformers,
  ScenePart,
  SculptBrushKind,
  SculptMeshData,
  SculptSettings,
} from '../types/robotics';

/**
 * Welds duplicate seam vertices so sculpting brushes never split seams open.
 */
export function weldAndNormalizeGeometry(
  rawGeo: THREE.BufferGeometry
): SculptMeshData {
  // Remove UV/normal attributes before welding so UV seams don't prevent welding
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
      Math.round(((posAttr.getZ(i) - center.z) / sz) * 10000) / 10000
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

/**
 * Subdivides triangles whose edges are longer than maxEdgeLen so any box/cylinder/extrusion
 * has plenty of vertices for smooth clay sculpting.
 */
export function tessellateGeometryForSculpting(
  geo: THREE.BufferGeometry,
  passes = 2
): THREE.BufferGeometry {
  let current = geo.index ? geo.toNonIndexed() : geo.clone();

  for (let p = 0; p < passes; p++) {
    const pos = current.getAttribute('position') as THREE.BufferAttribute;
    const triCount = pos.count / 3;
    if (triCount > 8000) break; // Already dense enough

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

      // 4 sub-triangles
      newCoords.push(
        vA.x, vA.y, vA.z, mAB.x, mAB.y, mAB.z, mCA.x, mCA.y, mCA.z,
        mAB.x, mAB.y, mAB.z, vB.x, vB.y, vB.z, mBC.x, mBC.y, mBC.z,
        mCA.x, mCA.y, mCA.z, mBC.x, mBC.y, mBC.z, vC.x, vC.y, vC.z,
        mAB.x, mAB.y, mAB.z, mBC.x, mBC.y, mBC.z, mCA.x, mCA.y, mCA.z
      );
    }

    const nextGeo = new THREE.BufferGeometry();
    nextGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(newCoords, 3)
    );
    current = nextGeo;
  }

  return current;
}

/**
 * Creates a fresh high-density welded clay primitive for immediate 3D sculpting.
 */
export function createSculptClayPreset(
  preset: 'clay_sphere' | 'clay_box' | 'clay_cylinder' | 'clay_capsule'
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

/**
 * Builds a Three.js BufferGeometry from SculptMeshData scaled to dimensions (w, h, d).
 */
export function buildBufferGeometryFromSculptData(
  sculptMesh: SculptMeshData,
  width: number,
  height: number,
  depth: number
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

/**
 * Extracts updated normalized SculptMeshData from a sculpted Three.js mesh geometry.
 */
export function extractSculptDataFromGeometry(
  geo: THREE.BufferGeometry,
  width: number,
  height: number,
  depth: number
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

/**
 * Applies a single 3D Sculpt Brush stroke step at localHitPoint & localNormal on a BufferGeometry.
 * Supports X and Z mirror symmetry and Alt-key brush inversion.
 */
export function applySculptStrokeOnGeometry(
  geo: THREE.BufferGeometry,
  localHitPoint: THREE.Vector3,
  localHitNormal: THREE.Vector3,
  dragDeltaLocal: THREE.Vector3,
  settings: SculptSettings,
  invertBrush = false
): void {
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  if (!geo.getAttribute('normal')) {
    geo.computeVertexNormals();
  }
  const normAttr = geo.getAttribute('normal') as THREE.BufferAttribute;

  const strokes: Array<{
    center: THREE.Vector3;
    normal: THREE.Vector3;
    delta: THREE.Vector3;
  }> = [
    {
      center: localHitPoint.clone(),
      normal: localHitNormal.clone().normalize(),
      delta: dragDeltaLocal.clone(),
    },
  ];

  if (settings.symmetryX && Math.abs(localHitPoint.x) > 0.5) {
    strokes.push({
      center: new THREE.Vector3(-localHitPoint.x, localHitPoint.y, localHitPoint.z),
      normal: new THREE.Vector3(-localHitNormal.x, localHitNormal.y, localHitNormal.z).normalize(),
      delta: new THREE.Vector3(-dragDeltaLocal.x, dragDeltaLocal.y, dragDeltaLocal.z),
    });
  }

  if (settings.symmetryZ && Math.abs(localHitPoint.z) > 0.5) {
    strokes.push({
      center: new THREE.Vector3(localHitPoint.x, localHitPoint.y, -localHitPoint.z),
      normal: new THREE.Vector3(localHitNormal.x, localHitNormal.y, -localHitNormal.z).normalize(),
      delta: new THREE.Vector3(dragDeltaLocal.x, dragDeltaLocal.y, -dragDeltaLocal.z),
    });
  }

  const radius = Math.max(2, settings.radiusMm);
  const radiusSq = radius * radius;
  const effectiveBrush: SculptBrushKind =
    invertBrush && settings.brush === 'inflate'
      ? 'carve'
      : invertBrush && settings.brush === 'carve'
        ? 'inflate'
        : settings.brush;

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (const stroke of strokes) {
    // First pass: gather affected vertices & average position (for smooth / flatten)
    const affectedIndices: number[] = [];
    const falloffs: number[] = [];
    const avgPos = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i);
      const distSq = v.distanceToSquared(stroke.center);
      if (distSq <= radiusSq) {
        const dist = Math.sqrt(distSq);
        // Smooth cosine falloff
        const falloff = 0.5 * (1 + Math.cos((Math.PI * dist) / radius));
        affectedIndices.push(i);
        falloffs.push(falloff);
        avgPos.add(v);
      }
    }

    if (affectedIndices.length === 0) continue;
    avgPos.divideScalar(affectedIndices.length);

    const amp = settings.strength * radius * 0.14;

    for (let k = 0; k < affectedIndices.length; k++) {
      const idx = affectedIndices[k];
      const w = falloffs[k];
      v.fromBufferAttribute(posAttr, idx);
      n.fromBufferAttribute(normAttr, idx);

      switch (effectiveBrush) {
        case 'inflate': {
          const pushDir = n.clone().lerp(stroke.normal, 0.5).normalize();
          v.addScaledVector(pushDir, amp * w);
          break;
        }
        case 'carve': {
          const carveDir = n.clone().lerp(stroke.normal, 0.5).normalize();
          v.addScaledVector(carveDir, -amp * w);
          break;
        }
        case 'flatten': {
          // Project vertex onto plane passing through stroke.center with normal stroke.normal
          const toVert = v.clone().sub(stroke.center);
          const signedDist = toVert.dot(stroke.normal);
          v.addScaledVector(
            stroke.normal,
            -signedDist * w * Math.min(1, settings.strength * 0.65)
          );
          break;
        }
        case 'smooth': {
          v.lerp(avgPos, w * Math.min(0.75, settings.strength * 0.45));
          break;
        }
        case 'pinch': {
          const toCenter = stroke.center.clone().sub(v);
          v.addScaledVector(toCenter, w * Math.min(0.5, settings.strength * 0.3));
          v.addScaledVector(stroke.normal, amp * 0.25 * w);
          break;
        }
        case 'grab': {
          v.addScaledVector(stroke.delta, w * Math.min(1, settings.strength * 1.1));
          break;
        }
      }

      posAttr.setXYZ(idx, v.x, v.y, v.z);
    }
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Applies non-destructive parametric deformers (Taper, Roundness, Twist, Bend) to a BufferGeometry.
 */
export function applyDeformersToBufferGeometry(
  geo: THREE.BufferGeometry,
  deformers?: PartDeformers
): void {
  if (!deformers) return;
  const {
    taper = 0,
    twistDeg = 0,
    bendDeg = 0,
    roundness = 0,
  } = deformers;

  if (
    Math.abs(taper) < 0.001 &&
    Math.abs(twistDeg) < 0.1 &&
    Math.abs(bendDeg) < 0.1 &&
    roundness < 0.001
  ) {
    return;
  }

  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const halfX = Math.max(1e-3, (box.max.x - box.min.x) / 2);
  const halfY = height / 2;
  const halfZ = Math.max(1e-3, (box.max.z - box.min.z) / 2);

  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  const twistRad = THREE.MathUtils.degToRad(twistDeg);
  const bendRad = THREE.MathUtils.degToRad(bendDeg);

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);

    // Normalized height t in [-0.5 .. +0.5]
    const t = (v.y - (box.min.y + box.max.y) / 2) / height;

    // 1. Roundness / Spherify
    if (roundness > 0.001) {
      const nx = v.x / halfX;
      const ny = v.y / halfY;
      const nz = v.z / halfZ;
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-4) {
        const sx = (nx / len) * halfX;
        const sy = (ny / len) * halfY;
        const sz = (nz / len) * halfZ;
        v.x = THREE.MathUtils.lerp(v.x, sx, roundness);
        v.y = THREE.MathUtils.lerp(v.y, sy, roundness);
        v.z = THREE.MathUtils.lerp(v.z, sz, roundness);
      }
    }

    // 2. Taper (scales X and Z smoothly from bottom to top)
    if (Math.abs(taper) > 0.001) {
      const scaleFactor = Math.max(0.08, 1 + taper * (t + 0.5));
      v.x *= scaleFactor;
      v.z *= scaleFactor;
    }

    // 3. Twist around Y axis
    if (Math.abs(twistRad) > 0.001) {
      const angle = twistRad * t;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rx = v.x * cos - v.z * sin;
      const rz = v.x * sin + v.z * cos;
      v.x = rx;
      v.z = rz;
    }

    // 4. Bend along Y into X arc
    if (Math.abs(bendRad) > 0.001) {
      const radius = height / bendRad;
      const theta = v.y / radius;
      const offsetX = radius - v.x;
      v.x = radius - Math.cos(theta) * offsetX;
      v.y = Math.sin(theta) * offsetX;
    }

    posAttr.setXYZ(i, v.x, v.y, v.z);
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Converts a Three.js Group of a ScenePart into a single merged world-space Brush for CSG Boolean ops.
 */
function buildCSGBrushFromGroup(group: THREE.Group): Brush | null {
  group.updateMatrixWorld(true);
  const evaluator = new Evaluator();
  evaluator.useGroups = false;

  const brushes: Brush[] = [];
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geoClone = child.geometry.clone();
      geoClone.applyMatrix4(child.matrixWorld);
      // Ensure UV and Normal attributes exist so three-bvh-csg is happy
      if (!geoClone.getAttribute('normal')) {
        geoClone.computeVertexNormals();
      }
      if (!geoClone.getAttribute('uv')) {
        const count = geoClone.getAttribute('position').count;
        geoClone.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2)
        );
      }
      const b = new Brush(geoClone);
      b.updateMatrixWorld();
      brushes.push(b);
    }
  });

  if (brushes.length === 0) return null;
  let combined = brushes[0];
  for (let i = 1; i < brushes.length; i++) {
    combined = evaluator.evaluate(combined, brushes[i], ADDITION);
  }
  return combined;
}

/**
 * Executes a real 3D Boolean CSG operation (Subtract Cutouts, Union Solids, or Intersect)
 * and returns a new sculpted/boolean ScenePart with the resulting mesh!
 */
export function runSceneBooleanCSG(
  basePart: ScenePart,
  operandParts: ScenePart[],
  operation: 'subtract' | 'union' | 'intersect',
  buildGroupFn: (part: ScenePart, isSelected: boolean) => THREE.Group
): ScenePart | null {
  const baseGroup = buildGroupFn(basePart, false);
  let resultBrush = buildCSGBrushFromGroup(baseGroup);
  if (!resultBrush) return null;

  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  const csgOp =
    operation === 'subtract'
      ? SUBTRACTION
      : operation === 'union'
        ? ADDITION
        : INTERSECTION;

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
    name:
      operation === 'subtract'
        ? `${basePart.name} (Cutouts Carved)`
        : `${basePart.name} (Boolean Merged)`,
    kind: 'sculpt_mesh',
    category: 'custom_models',
    role: 'solid',
    position: [
      Math.round(center.x * 10) / 10,
      Math.round(center.y * 10) / 10,
      Math.round(center.z * 10) / 10,
    ],
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
