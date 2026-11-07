import * as THREE from 'three';
import { encloses, pointInPolygon, type Point2 } from './markMath';
import { hitPartId, partMeshes } from './picking';
import type { Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

const MAX_PROBES = 48;

const round = (v: number) => Math.round(v * 10) / 10;

export const roundedPoint = (p: THREE.Vector3): Vec3 => [round(p.x), round(p.y), round(p.z)];

export function screenPixel(ctx: ViewportContext, point: THREE.Vector3): Point2 | null {
  const { camera, renderer } = ctx.stage;
  const projected = point.clone().project(camera);

  if (projected.z > 1) return null;

  return [
    ((projected.x + 1) / 2) * renderer.domElement.clientWidth,
    ((1 - projected.y) / 2) * renderer.domElement.clientHeight,
  ];
}

export function enclosedParts(ctx: ViewportContext, polygon: Point2[]): string[] {
  const box = new THREE.Box3();
  const center = new THREE.Vector3();

  return ctx.layer.objects().flatMap(([id, object]) => {
    if (!object.visible || box.setFromObject(object).isEmpty()) return [];

    const pixel = screenPixel(ctx, box.getCenter(center));

    return pixel && pointInPolygon(pixel, polygon) ? [id] : [];
  });
}

export function partsUnder(ctx: ViewportContext, raycaster: THREE.Raycaster, points: THREE.Vector3[]): string[] {
  const { camera } = ctx.stage;
  const step = Math.max(1, Math.ceil(points.length / MAX_PROBES));
  const meshes = partMeshes(ctx.stage);
  const ids = new Set<string>();

  for (let i = 0; i < points.length; i += step) {
    raycaster.set(camera.position, points[i].clone().sub(camera.position).normalize());

    const id = hitPartId(raycaster.intersectObjects(meshes, false)[0] ?? null);

    if (id) ids.add(id);
  }

  return [...ids];
}

export function markParts(ctx: ViewportContext, raycaster: THREE.Raycaster, points: THREE.Vector3[]): string[] {
  const pixels = points.flatMap((p) => {
    const pixel = screenPixel(ctx, p);

    return pixel ? [pixel] : [];
  });
  const enclosed = encloses(pixels) ? enclosedParts(ctx, pixels) : [];

  return [...new Set([...enclosed, ...partsUnder(ctx, raycaster, points)])];
}
