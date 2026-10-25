import * as THREE from 'three';
import { worldTriangles } from '../meshMeasure';
import { floorPoint, hitPartId, partMeshes, rayAt } from './picking';
import type { Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

const UNIT = new THREE.Vector3(1, 1, 1);

const toVec3 = (v: THREE.Vector3) => v.toArray() as Vec3;

export function solidObjects(ctx: ViewportContext, options: { visibleOnly: boolean }) {
  return ctx.stage.partsRoot.children.flatMap((object) => {
    const part = ctx.layer.part(object.userData.partId as string);
    const hidden = options.visibleOnly && !part?.visible;

    if (!part || hidden || part.role !== 'solid' || part.kind === 'image_plane') return [];

    return [{ id: part.id, object }];
  });
}

export function partObjects(ctx: ViewportContext, ids?: string[]) {
  const want = ids ? new Set(ids) : null;

  return ctx.stage.partsRoot.children.flatMap((object) => {
    const id = object.userData.partId as string | undefined;

    return id && (!want || want.has(id)) ? [{ id, object }] : [];
  });
}

export function posedFloor(ctx: ViewportContext, ids?: string[]): number | null {
  const box = new THREE.Box3();
  const only = ids ? new Set(ids) : null;

  for (const { id, object } of solidObjects(ctx, { visibleOnly: false })) {
    if (!only || only.has(id)) box.expandByObject(object);
  }

  return box.isEmpty() ? null : box.min.y;
}

export function boundsOf(ctx: ViewportContext, ids: string[]): { min: Vec3; max: Vec3 } | null {
  const box = new THREE.Box3();

  ids.forEach((id) => {
    const object = ctx.layer.get(id);

    if (object) box.expandByObject(object);
  });

  return box.isEmpty() ? null : { min: toVec3(box.min), max: toVec3(box.max) };
}

function inverseRigid(object: THREE.Object3D) {
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();

  object.matrixWorld.decompose(t, q, new THREE.Vector3());

  return { t, q, inverse: new THREE.Matrix4().compose(t, q, UNIT).invert() };
}

export function partTriangles(ctx: ViewportContext, id: string): Float32Array | null {
  const object = ctx.layer.get(id);

  if (!object) {
    return null;
  }

  const triangles = worldTriangles(object);
  const { inverse } = inverseRigid(object);
  const v = new THREE.Vector3();

  for (let i = 0; i < triangles.length; i += 3) {
    v.set(triangles[i], triangles[i + 1], triangles[i + 2]).applyMatrix4(inverse);
    triangles.set([v.x, v.y, v.z], i);
  }

  return triangles;
}

const OUTPUT_FACE_BAND = 0.6;

export function servoOutput(ctx: ViewportContext, id: string): { point: Vec3; axis: Vec3 } | null {
  const object = ctx.layer.get(id);

  if (!object) {
    return null;
  }

  object.updateWorldMatrix(true, true);

  const { t, q, inverse } = inverseRigid(object);
  const triangles = worldTriangles(object);

  if (!triangles.length) {
    return null;
  }

  const local: THREE.Vector3[] = [];

  for (let i = 0; i < triangles.length; i += 3) {
    local.push(new THREE.Vector3(triangles[i], triangles[i + 1], triangles[i + 2]).applyMatrix4(inverse));
  }

  const top = local.reduce((max, v) => Math.max(max, v.y), -Infinity);
  const cap = local.filter((v) => v.y >= top - OUTPUT_FACE_BAND);
  const center = new THREE.Vector3(
    cap.reduce((sum, v) => sum + v.x, 0) / cap.length,
    top,
    cap.reduce((sum, v) => sum + v.z, 0) / cap.length,
  );

  return {
    point: toVec3(center.applyQuaternion(q).add(t)),
    axis: toVec3(new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize()),
  };
}

export function pickAt(ctx: ViewportContext, clientX: number, clientY: number) {
  const raycaster = rayAt(ctx.stage, clientX, clientY);
  const hit = raycaster.intersectObjects(partMeshes(ctx.stage), false)[0];

  if (hit) {
    return { partId: hitPartId(hit), point: toVec3(hit.point) };
  }

  const floor = floorPoint(raycaster);

  return floor ? { partId: null, point: [floor.x, 0, floor.z] as Vec3 } : null;
}

export function projectPoints(ctx: ViewportContext, points: Vec3[]) {
  const { container, renderer, camera } = ctx.stage;
  const canvas = renderer.domElement;
  const offsetX = (canvas.clientWidth - container.clientWidth) / 2;
  const offsetY = (canvas.clientHeight - container.clientHeight) / 2;
  const v = new THREE.Vector3();

  return points.map(([x, y, z]) => {
    v.set(x, y, z).project(camera);

    return {
      x: (v.x * 0.5 + 0.5) * canvas.clientWidth - offsetX,
      y: (-v.y * 0.5 + 0.5) * canvas.clientHeight - offsetY,
      visible: v.z > -1 && v.z < 1,
    };
  });
}
