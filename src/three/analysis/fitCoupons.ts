import * as THREE from 'three';
import { Brush, Evaluator, INTERSECTION } from 'three-bvh-csg';
import { measureTriangles, type MeshMeasure } from '../meshMeasure';
import { extraPose, type PrintPose, type Vec3 } from '../printability';
import { isInside, type Placed } from './collide';
import { ShapeSolid } from './shapeSolid';

export interface FitSpec {
  id: string;
  key: string;
}

export interface FitCouponTask {
  fits: FitSpec[];
  hosts: string[];
  downs: Record<string, Vec3>;
}

export interface FitCoupon {
  key: string;
  fit: string;
  host: string;
  positions: Float32Array;
  pose: PrintPose;
  measure: MeshMeasure;
  center: Vec3;
  axis: Vec3;
  reach: number;
}

export const FIT_WALL_MM = 4;

const TOUCH_MM = 0.5;
const DOWN: Vec3 = [0, -1, 0];

const overlapVolume = (a: THREE.Box3, b: THREE.Box3) => {
  const box = a.clone().intersect(b);

  return box.isEmpty()
    ? 0
    : box
        .getSize(new THREE.Vector3())
        .toArray()
        .reduce((v, s) => v * s, 1);
};

function holds(host: Placed, fit: Placed): boolean {
  const toHost = host.inverse.clone().multiply(fit.matrix);
  const touchBox = fit.solid.box.clone().expandByScalar(TOUCH_MM);

  if (host.solid.bvh.intersectsBox(touchBox, toHost)) return true;

  return isInside(host.solid, fit.solid.box.getCenter(new THREE.Vector3()).applyMatrix4(toHost));
}

function hostOf(fit: Placed, hosts: Placed[]): Placed | null {
  const near = hosts
    .map((host) => ({ host, overlap: overlapVolume(host.box, fit.box) }))
    .filter((h) => h.overlap > 0 && holds(h.host, fit))
    .sort((a, b) => b.overlap - a.overlap);

  return near[0]?.host ?? null;
}

function brushOf(geometry: THREE.BufferGeometry) {
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();

  const brush = new Brush(geometry);

  brush.updateMatrixWorld();

  return brush;
}

export function cutBox(positions: Float32Array, region: THREE.Box3, toHost: THREE.Matrix4): Float32Array {
  const host = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  const size = region.getSize(new THREE.Vector3());
  const center = region.getCenter(new THREE.Vector3());
  const box = new THREE.BoxGeometry(size.x, size.y, size.z)
    .toNonIndexed()
    .translate(center.x, center.y, center.z)
    .applyMatrix4(toHost);
  const evaluator = new Evaluator();

  evaluator.useGroups = false;
  evaluator.attributes = ['position', 'normal'];

  const result = evaluator.evaluate(brushOf(host), brushOf(box), INTERSECTION).geometry;
  const flat = result.index ? result.toNonIndexed() : result;

  return new Float32Array(flat.attributes.position.array);
}

function couponOf(fit: Placed, host: Placed, task: FitCouponTask & { key: string }): FitCoupon | null {
  const toHost = host.inverse.clone().multiply(fit.matrix);
  const region = fit.solid.box.clone().expandByScalar(FIT_WALL_MM);
  const positions = cutBox(host.solid.positions, region, toHost);

  if (positions.length < 9) return null;

  const solid = new ShapeSolid(positions);
  const pose = extraPose(positions, solid.bvh, task.downs[host.id] ?? DOWN);
  const half = fit.solid.box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const center = fit.solid.box.getCenter(new THREE.Vector3()).applyMatrix4(toHost);
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(toHost);

  solid.dispose();

  return {
    key: task.key,
    fit: fit.id,
    host: host.id,
    positions,
    pose,
    measure: measureTriangles(positions),
    center: center.toArray(),
    axis: axis.toArray(),
    reach: half.y,
  };
}

export function fitCoupons(placed: Placed[], task: FitCouponTask): FitCoupon[] {
  const byId = new Map(placed.map((p) => [p.id, p]));
  const hosts = task.hosts.flatMap((id) => byId.get(id) ?? []);
  const cut = new Map<string, FitCoupon>();

  for (const { id, key } of task.fits) {
    const fit = byId.get(id);
    const host = fit && !cut.has(key) ? hostOf(fit, hosts) : null;
    const coupon = host && couponOf(fit!, host, { ...task, key });

    if (coupon) cut.set(key, coupon);
  }

  return [...cut.values()];
}
