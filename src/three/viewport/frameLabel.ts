import type { FrameAxes } from '../../dataLayers/draw';
import { FramePicker } from './framePicker';
import type { ViewportContext } from './viewportContext';

export class FrameLabel {
  private readonly picker = new FramePicker();

  private readonly ctx: ViewportContext;

  private readonly label: () => HTMLElement | null;

  private readonly frames: () => FrameAxes[];

  private readonly onMove = (e: PointerEvent) => this.show(e);

  constructor(ctx: ViewportContext, label: () => HTMLElement | null, frames: () => FrameAxes[]) {
    this.ctx = ctx;
    this.label = label;
    this.frames = frames;
    ctx.stage.renderer.domElement.addEventListener('pointermove', this.onMove, { passive: true });
  }

  dispose(): void {
    this.ctx.stage.renderer.domElement.removeEventListener('pointermove', this.onMove);
  }

  private show(e: PointerEvent) {
    const label = this.label();

    if (!label) return;

    const frames = this.frames();

    if (!frames.length) {
      label.style.display = 'none';

      return;
    }

    const rect = this.ctx.stage.container.getBoundingClientRect();
    const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = this.picker.pick(frames, this.ctx.stage, pointer);

    if (hit < 0) {
      label.style.display = 'none';

      return;
    }

    label.textContent = frames[hit].name;
    label.style.display = 'flex';
    label.style.transform = `translate(${this.picker.x}px, ${this.picker.y}px) translate(12px, -50%)`;
  }
}
