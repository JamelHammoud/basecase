import * as THREE from 'three';
import { projectPoints } from './measurements';
import type { ViewportContext } from './viewportContext';
import type { Vec3 } from './types';

export interface WorkspaceView {
  positions: Float64Array;
  selected: number | null;
  select: (index: number) => void;
}

const material = (size: number) =>
  new THREE.PointsMaterial({
    color: 0x0d99ff,
    size,
    sizeAttenuation: false,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });

function pointGeometry(positions?: Float64Array) {
  const geometry = new THREE.BufferGeometry();

  if (positions) geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));

  return geometry;
}

export class WorkspaceLayer {
  private readonly points = new THREE.Points(new THREE.BufferGeometry(), material(5));
  private readonly selected = new THREE.Points(new THREE.BufferGeometry(), material(13));
  private view: WorkspaceView | null = null;
  private readonly ctx: ViewportContext;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
    this.points.renderOrder = 1080;
    this.selected.renderOrder = 1081;
    this.points.raycast = this.selected.raycast = () => {};
    this.points.visible = this.selected.visible = false;
    ctx.stage.overlays.add(this.points, this.selected);
  }

  sync(view: WorkspaceView | null) {
    if (view?.positions !== this.view?.positions) {
      this.points.geometry.dispose();
      this.points.geometry = pointGeometry(view?.positions);
    }

    this.view = view;
    this.points.visible = !!view;
    this.selected.geometry.dispose();
    this.selected.geometry = new THREE.BufferGeometry();
    this.selected.visible = !!view && view.selected !== null;

    if (view && view.selected !== null)
      this.selected.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(Float32Array.from(view.positions.slice(view.selected * 3, view.selected * 3 + 3)), 3),
      );
  }

  install() {
    const canvas = this.ctx.stage.renderer.domElement;

    canvas.addEventListener('pointerdown', this.pick, true);

    return () => canvas.removeEventListener('pointerdown', this.pick, true);
  }

  private pick = (event: PointerEvent) => {
    const view = this.view;

    if (!view || event.button !== 0) return;

    const positions: Vec3[] = Array.from({ length: view.positions.length / 3 }, (_, i) => [
      view.positions[i * 3],
      view.positions[i * 3 + 1],
      view.positions[i * 3 + 2],
    ]);
    const screen = projectPoints(this.ctx, positions);
    const bounds = this.ctx.stage.container.getBoundingClientRect();
    let nearest = -1;
    let distance = 8;

    screen.forEach((point, i) => {
      const gap = Math.hypot(point.x + bounds.left - event.clientX, point.y + bounds.top - event.clientY);

      if (!point.visible || gap >= distance) return;

      nearest = i;
      distance = gap;
    });

    if (nearest < 0) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    view.select(nearest);
  };

  dispose() {
    this.ctx.stage.renderer.domElement.removeEventListener('pointerdown', this.pick, true);
    this.points.removeFromParent();
    this.selected.removeFromParent();
    this.points.geometry.dispose();
    this.selected.geometry.dispose();
    this.points.material.dispose();
    this.selected.material.dispose();
    this.view = null;
  }
}
