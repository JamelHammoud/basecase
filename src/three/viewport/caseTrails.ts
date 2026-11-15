import * as THREE from 'three';
import type { RunOutcome } from '../../cases/caseRuns';
import { projectPoints } from './measurements';
import type { Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

function segmentDistance(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;

  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

const pointsOf = (path: Float32Array): Vec3[] =>
  Array.from({ length: path.length / 3 }, (_, i) => [path[i * 3], path[i * 3 + 1], path[i * 3 + 2]]);

export class CaseTrails {
  private readonly group = new THREE.Group();
  private outcomes: RunOutcome[] = [];
  private replay: (seed: number) => void = () => {};
  private down: { x: number; y: number } | null = null;
  private readonly ctx: ViewportContext;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
    ctx.stage.overlays.add(this.group);
    ctx.stage.renderer.domElement.addEventListener('pointerdown', this.onDown, true);
    ctx.stage.renderer.domElement.addEventListener('pointerup', this.onUp, true);
  }

  set(outcomes: RunOutcome[], replay: (seed: number) => void): void {
    this.clear();
    this.outcomes = outcomes;
    this.replay = replay;

    for (const outcome of outcomes) {
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(outcome.path, 3));
      const material = new THREE.LineBasicMaterial({
        color: outcome.passed ? '#34d399' : '#f87171',
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const line = new THREE.Line(geometry, material);

      line.renderOrder = 1035;
      line.raycast = () => {};
      this.group.add(line);
    }

    this.ctx.loop.redraw();
  }

  state() {
    const rect = this.ctx.stage.container.getBoundingClientRect();

    return this.outcomes.map(({ path, ...outcome }) => ({
      ...outcome,
      points: projectPoints(this.ctx, pointsOf(path)).map((p) => ({ ...p, x: p.x + rect.left, y: p.y + rect.top })),
    }));
  }

  pick(x: number, y: number): RunOutcome | null {
    const rect = this.ctx.stage.container.getBoundingClientRect();
    const point = { x: x - rect.left, y: y - rect.top, visible: true };
    let distance = 6;
    let picked: RunOutcome | null = null;

    for (const outcome of this.outcomes.filter((o) => !o.passed)) {
      const points = projectPoints(this.ctx, pointsOf(outcome.path));
      const near = points
        .slice(1)
        .reduce(
          (best, b, i) =>
            b.visible && points[i].visible ? Math.min(best, segmentDistance(point, points[i], b)) : best,
          Infinity,
        );

      if (near < distance) {
        distance = near;
        picked = outcome;
      }
    }

    return picked;
  }

  private readonly onDown = (e: PointerEvent) => {
    const tools = this.ctx.props();
    const editing = tools.measureMode || tools.annotateMode || tools.markMode || tools.axisPick || tools.buildStep;

    this.down = e.button === 0 && !editing ? { x: e.clientX, y: e.clientY } : null;
  };

  private readonly onUp = (e: PointerEvent) => {
    const down = this.down;

    this.down = null;

    if (!down || this.ctx.runtime.draggingGizmo || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;

    const outcome = this.pick(e.clientX, e.clientY);

    if (!outcome) return;

    e.preventDefault();
    this.replay(outcome.seed);
  };

  private clear(): void {
    for (const line of this.group.children) {
      const drawn = line as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;

      drawn.geometry.dispose();
      drawn.material.dispose();
    }

    this.group.clear();
  }

  dispose(): void {
    this.ctx.stage.renderer.domElement.removeEventListener('pointerdown', this.onDown, true);
    this.ctx.stage.renderer.domElement.removeEventListener('pointerup', this.onUp, true);
    this.clear();
    this.group.removeFromParent();
  }
}
