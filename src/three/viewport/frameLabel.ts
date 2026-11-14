import type { FrameAxes } from '../../dataLayers/draw';
import { projectPoints } from './measurements';
import type { ViewportContext } from './viewportContext';

const REACH_PX = 12;

export function nearestFrame(
  frames: FrameAxes[],
  screen: Array<{ x: number; y: number; visible: boolean }>,
  pointer: { x: number; y: number },
): number {
  let best = -1;
  let bestDistance = REACH_PX;

  screen.forEach((s, i) => {
    const d = Math.hypot(s.x - pointer.x, s.y - pointer.y);

    if (s.visible && d <= bestDistance) {
      best = i;
      bestDistance = d;
    }
  });

  return frames.length ? best : -1;
}

export class FrameLabel {
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
    const origins = frames.map(
      (f) => [f.matrix.elements[12], f.matrix.elements[13], f.matrix.elements[14]] as [number, number, number],
    );
    const screen = projectPoints(this.ctx, origins);
    const hit = nearestFrame(frames, screen, pointer);

    if (hit < 0) {
      label.style.display = 'none';

      return;
    }

    label.textContent = frames[hit].name;
    label.style.display = 'flex';
    label.style.transform = `translate(${screen[hit].x}px, ${screen[hit].y}px) translate(12px, -50%)`;
  }
}
