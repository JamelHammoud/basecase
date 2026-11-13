import * as THREE from 'three';
import { solidFromPositions, type ShapeSolid } from '../three/analysis/shapeSolid';
import { CellMask } from './cellMask';

export type V3 = [number, number, number];

const RAY_NUDGE = 1.3e-4;

interface Row {
  at: Float64Array;
  turn: Int8Array;
}

export class SolidField {
  readonly box: THREE.Box3;
  private readonly solid: ShapeSolid;
  private readonly rows = new Map<number, Map<number, Row>>();
  private readonly at = new THREE.Vector3();
  private readonly ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
  private mask: CellMask | null = null;

  constructor(soup: Float32Array) {
    this.solid = solidFromPositions(soup);
    this.box = this.solid.box.clone();
  }

  contains(x: number, y: number, z: number): boolean {
    const { min, max } = this.box;

    if (x < min.x || x > max.x || y < min.y || y > max.y || z < min.z || z > max.z) return false;

    const row = this.row(y, z);
    let winding = 0;

    for (let i = 0; i < row.at.length && row.at[i] < x; i++) winding += row.turn[i];

    return winding !== 0;
  }

  depth(p: V3, cap: number): number {
    const sign = this.contains(p[0], p[1], p[2]) ? 1 : -1;

    this.mask ??= new CellMask(this.solid.positions, cap);

    if (!this.mask.has(p[0], p[1], p[2])) return sign * cap;

    const hit = this.solid.bvh.closestPointToPoint(this.at.set(p[0], p[1], p[2]), undefined, 0, cap);

    return sign * (hit ? hit.distance : cap);
  }

  dispose(): void {
    this.solid.dispose();
  }

  private row(y: number, z: number): Row {
    const plane = this.rows.get(y) ?? this.rows.set(y, new Map()).get(y)!;
    const known = plane.get(z);

    if (known) return known;

    this.ray.origin.set(this.box.min.x - 1, y + RAY_NUDGE, z + RAY_NUDGE * Math.SQRT2);

    const hits = this.solid.bvh
      .raycast(this.ray, THREE.DoubleSide)
      .filter((h) => h.face)
      .sort((a, b) => a.point.x - b.point.x);
    const row = {
      at: Float64Array.from(hits, (h) => h.point.x),
      turn: Int8Array.from(hits, (h) => (h.face!.normal.x < 0 ? 1 : -1)),
    };

    plane.set(z, row);

    return row;
  }
}
