import type { MarkLayer } from './markLayer';
import type { Point2 } from './markMath';
import { canvasNdc } from './stage';
import type { ViewportContext } from './viewportContext';

const STEP_PX = 4;

export class MarkEraser {
  private pointerId: number | null = null;

  private last: Point2 | null = null;

  private readonly erased = new Set<string>();

  private readonly ctx: ViewportContext;

  private readonly layer: MarkLayer;

  constructor(ctx: ViewportContext, layer: MarkLayer) {
    this.ctx = ctx;
    this.layer = layer;
  }

  install(): () => void {
    const canvas = this.ctx.stage.renderer.domElement;
    const down = (e: PointerEvent) => this.onDown(e);
    const move = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e);
    const cancel = () => this.cancel();

    canvas.addEventListener('pointerdown', down, { capture: true });
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);

    return () => {
      this.cancel();
      canvas.removeEventListener('pointerdown', down, { capture: true });
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
    };
  }

  cancel(): void {
    if (this.pointerId === null) return;

    this.pointerId = null;
    this.last = null;
    this.erased.clear();
    this.layer.fade(this.erased);
    this.ctx.stage.orbit.enabled = true;
    this.ctx.loop.invalidate();
  }

  private onDown(e: PointerEvent): void {
    const { markMode, markTool } = this.ctx.props();

    if (!markMode || markTool !== 'eraser' || e.button !== 0) return;

    this.ctx.stage.orbit.enabled = false;
    this.ctx.stage.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointerId = e.pointerId;
    this.sweep(e);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;

    this.sweep(e);
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;

    this.sweep(e);

    const ids = [...this.erased];

    this.cancel();

    if (ids.length) this.ctx.props().onEraseMarks?.(ids);
  }

  private sweep(e: PointerEvent): void {
    const { camera, renderer } = this.ctx.stage;
    const size = { width: renderer.domElement.clientWidth, height: renderer.domElement.clientHeight };
    const ndc = canvasNdc(this.ctx.stage, e.clientX, e.clientY);
    const pixel: Point2 = [((ndc.x + 1) / 2) * size.width, ((1 - ndc.y) / 2) * size.height];
    const from = this.last ?? pixel;
    const steps = Math.max(1, Math.ceil(Math.hypot(pixel[0] - from[0], pixel[1] - from[1]) / STEP_PX));
    const before = this.erased.size;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const point: Point2 = [from[0] + (pixel[0] - from[0]) * t, from[1] + (pixel[1] - from[1]) * t];

      this.layer.hits(point, camera, size).forEach((id) => this.erased.add(id));
    }

    this.last = pixel;

    if (this.erased.size === before) return;

    this.layer.fade(this.erased);
    this.ctx.loop.invalidate();
  }
}
