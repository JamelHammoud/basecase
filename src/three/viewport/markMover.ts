import * as THREE from 'three';
import type { MarkLayer } from './markLayer';
import type { Point2 } from './markMath';
import { markParts, roundedPoint } from './markParts';
import { partRaycaster, rayAt } from './picking';
import { canvasNdc } from './stage';
import type { ViewportContext } from './viewportContext';

const MOVE_PX = 3;

interface Drag {
  pointerId: number;
  id: string;
  plane: THREE.Plane;
  start: THREE.Vector3;
  pixel: Point2;
  moved: boolean;
}

export class MarkMover {
  private drag: Drag | null = null;

  private hoverFrame = 0;

  private readonly raycaster = partRaycaster();

  private readonly ctx: ViewportContext;

  private readonly layer: MarkLayer;

  constructor(ctx: ViewportContext, layer: MarkLayer) {
    this.ctx = ctx;
    this.layer = layer;
  }

  install(): () => void {
    const canvas = this.ctx.stage.renderer.domElement;
    const move = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e);
    const cancel = () => this.cancel();

    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);

    return () => {
      this.cancel();
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
    };
  }

  grab(e: PointerEvent): boolean {
    const pixel = this.pixelOf(e);
    const id = this.layer.hitTest(pixel, this.ctx.stage.camera, this.size());
    const center = id ? this.layer.centerOf(id) : null;

    if (!id || !center) return false;

    const forward = this.ctx.stage.camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, center);
    const start = this.onPlane(e, plane);

    if (!start) return false;

    this.ctx.stage.orbit.enabled = false;
    this.ctx.stage.renderer.domElement.setPointerCapture(e.pointerId);
    this.drag = { pointerId: e.pointerId, id, plane, start, pixel, moved: false };
    this.ctx.props().onSelectMark?.(id);

    return true;
  }

  cancel(): void {
    cancelAnimationFrame(this.hoverFrame);
    this.hoverFrame = 0;
    this.ctx.stage.renderer.domElement.style.cursor = '';

    const drag = this.drag;

    if (!drag) return;

    this.drag = null;
    this.ctx.stage.orbit.enabled = true;

    if (drag.moved) this.layer.shift(drag.id, new THREE.Vector3());

    this.ctx.loop.invalidate();
  }

  private onMove(e: PointerEvent): void {
    const drag = this.drag;

    if (!drag) {
      this.scheduleHover(e);

      return;
    }

    if (e.pointerId !== drag.pointerId) return;

    const [x, y] = this.pixelOf(e);

    drag.moved ||= Math.hypot(x - drag.pixel[0], y - drag.pixel[1]) >= MOVE_PX;

    const point = drag.moved ? this.onPlane(e, drag.plane) : null;

    if (!point) return;

    this.layer.shift(drag.id, point.sub(drag.start));
    this.ctx.loop.invalidate();
  }

  private onUp(e: PointerEvent): void {
    const drag = this.drag;

    if (e.pointerId !== drag?.pointerId) return;

    this.drag = null;
    this.ctx.stage.orbit.enabled = true;

    const points = drag.moved ? this.layer.pointsOf(drag.id) : null;

    if (!points) return;

    this.ctx.props().onMoveMark?.({
      id: drag.id,
      points: points.map(roundedPoint),
      partIds: markParts(this.ctx, this.raycaster, points),
    });
  }

  private scheduleHover(e: PointerEvent): void {
    const { clientX, clientY, buttons } = e;

    if (this.hoverFrame || !this.ctx.props().markMode) return;

    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      this.hover({ clientX, clientY, buttons });
    });
  }

  private hover(e: Pick<PointerEvent, 'clientX' | 'clientY' | 'buttons'>): void {
    const { markMode, markTool } = this.ctx.props();
    const grabbable =
      markMode &&
      markTool !== 'eraser' &&
      e.buttons === 0 &&
      Boolean(this.layer.hitTest(this.pixelOf(e), this.ctx.stage.camera, this.size()));

    this.ctx.stage.renderer.domElement.style.cursor = grabbable ? 'move' : '';
  }

  private onPlane(e: Pick<PointerEvent, 'clientX' | 'clientY'>, plane: THREE.Plane): THREE.Vector3 | null {
    return rayAt(this.ctx.stage, e.clientX, e.clientY).ray.intersectPlane(plane, new THREE.Vector3());
  }

  private size() {
    const canvas = this.ctx.stage.renderer.domElement;

    return { width: canvas.clientWidth, height: canvas.clientHeight };
  }

  private pixelOf(e: Pick<PointerEvent, 'clientX' | 'clientY'>): Point2 {
    const ndc = canvasNdc(this.ctx.stage, e.clientX, e.clientY);
    const { width, height } = this.size();

    return [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
  }
}
