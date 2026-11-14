import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { RunTrail } from '../../utils/engineeringTypes';
import type { Stage } from './stage';

const TRAIL_ORDER = 1035;
const WIDTH_PX = 1.5;
const OPACITY = 0.85;
const PASS = '#34d399';
const FAIL = '#f87171';
const PICK_PX = 8;

export interface TrailEnd {
  seed: number;
  passed: boolean;
  x: number;
  y: number;
}

function segments(trails: RunTrail[]): number[] {
  const out: number[] = [];

  for (const { path } of trails) {
    for (let i = 3; i + 2 < path.length; i += 3) out.push(...path.subarray(i - 3, i + 3));
  }

  return out;
}

function trailLine(color: string): LineSegments2 {
  const material = new LineMaterial({
    color,
    linewidth: WIDTH_PX,
    opacity: OPACITY,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new LineSegments2(new LineSegmentsGeometry(), material);

  line.renderOrder = TRAIL_ORDER;
  line.frustumCulled = false;
  line.raycast = () => {};
  line.onBeforeRender = (renderer) => renderer.getSize(material.resolution);

  return line;
}

function segmentDistance(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number {
  const ab = b.clone().sub(a);
  const t = ab.lengthSq() ? THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1) : 0;

  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

export class CaseTrails {
  private trails: RunTrail[] = [];

  private readonly pass = trailLine(PASS);

  private readonly fail = trailLine(FAIL);

  private readonly stage: Stage;

  constructor(stage: Stage) {
    this.stage = stage;
  }

  get count(): number {
    return this.pass.parent || this.fail.parent ? this.trails.length : 0;
  }

  sync(trails: RunTrail[] | null | undefined): void {
    this.trails = trails ?? [];

    for (const [line, passed] of [
      [this.pass, true],
      [this.fail, false],
    ] as const) {
      const points = segments(this.trails.filter((t) => t.passed === passed));

      line.geometry.dispose();
      line.geometry = new LineSegmentsGeometry();

      if (points.length) line.geometry.setPositions(points);

      if (points.length) this.stage.overlays.add(line);
      else line.removeFromParent();
    }
  }

  pickAt(clientX: number, clientY: number): number | null {
    const at = new THREE.Vector2(clientX, clientY);
    let best: { seed: number; px: number } | null = null;

    for (const trail of this.trails) {
      if (trail.passed) continue;

      const px = this.distanceTo(trail, at);

      if (px <= PICK_PX && (!best || px < best.px)) best = { seed: trail.seed, px };
    }

    return this.count ? (best?.seed ?? null) : null;
  }

  ends(): TrailEnd[] {
    if (!this.count) return [];

    return this.trails.map(({ seed, passed, path }) => {
      const end = this.toScreen(path, path.length / 3 - 1);

      return { seed, passed, x: end.x, y: end.y };
    });
  }

  dispose(): void {
    for (const line of [this.pass, this.fail]) {
      line.removeFromParent();
      line.geometry.dispose();
      line.material.dispose();
    }
  }

  private toScreen(path: Float32Array, i: number): THREE.Vector2 {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector3(path[i * 3], path[i * 3 + 1], path[i * 3 + 2]).project(this.stage.camera);

    return new THREE.Vector2(rect.left + ((ndc.x + 1) / 2) * rect.width, rect.top + ((1 - ndc.y) / 2) * rect.height);
  }

  private distanceTo(trail: RunTrail, at: THREE.Vector2): number {
    const points = Array.from({ length: trail.path.length / 3 }, (_, i) => this.toScreen(trail.path, i));

    if (points.length === 1) return points[0].distanceTo(at);

    return points.slice(1).reduce((best, b, i) => Math.min(best, segmentDistance(at, points[i], b)), Infinity);
  }
}
