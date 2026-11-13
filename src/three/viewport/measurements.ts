import * as THREE from 'three';
import { outputLine } from '../analysis/rotorSplit';
import { localTriangles, rigidFrame } from '../meshMeasure';
import { floorPoint, hitPartId, partMeshes, rayAt } from './picking';
import type { Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

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

export function floorObjects(ctx: ViewportContext, ids?: string[]) {
  const only = ids ? new Set(ids) : null;

  return solidObjects(ctx, { visibleOnly: false }).filter(({ id }) => !only || only.has(id));
}

export function boundsOf(ctx: ViewportContext, ids: string[]): { min: Vec3; max: Vec3 } | null {
  const box = new THREE.Box3();

  ids.forEach((id) => {
    const object = ctx.layer.get(id);

    if (object) box.expandByObject(object, true);
  });

  return box.isEmpty() ? null : { min: toVec3(box.min), max: toVec3(box.max) };
}

export function partTriangles(ctx: ViewportContext, id: string): Float32Array | null {
  const object = ctx.layer.get(id) ?? ctx.world.get(id);

  return object ? localTriangles(object) : null;
}

export function servoOutput(ctx: ViewportContext, id: string): { point: Vec3; axis: Vec3 } | null {
  const object = ctx.layer.get(id);

  if (!object || ctx.layer.isPlaceholder(id)) {
    return null;
  }

  const triangles = localTriangles(object);

  if (!triangles.length) {
    return null;
  }

  const { t, q } = rigidFrame(object);
  const line = outputLine(triangles);

  return {
    point: toVec3(line.start.applyQuaternion(q).add(t)),
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
