import type { MarkLayer } from './markLayer';
import { projectPoints } from './measurements';
import type { ViewportContext } from './viewportContext';

const GAP_PX = 8;

export class MarkFieldAnchor {
  private readonly ctx: ViewportContext;

  private readonly layer: MarkLayer;

  private readonly element: () => HTMLElement | null;

  constructor(ctx: ViewportContext, layer: MarkLayer, element: () => HTMLElement | null) {
    this.ctx = ctx;
    this.layer = layer;
    this.element = element;
  }

  place(): void {
    const element = this.element();

    if (!element) return;

    const id = this.ctx.props().selectedMarkId;
    const top = id ? this.layer.topOf(id, this.ctx.stage.camera) : null;
    const [screen] = top ? projectPoints(this.ctx, [[top.x, top.y, top.z]]) : [];

    element.style.visibility = screen?.visible ? 'visible' : 'hidden';

    if (!screen?.visible) return;

    element.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, calc(-100% - ${GAP_PX}px))`;
  }
}
