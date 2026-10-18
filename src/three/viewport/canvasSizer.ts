import type { Stage } from './stage';

const SETTLE_MS = 180;

export class CanvasSizer {
  private width = 0;

  private height = 0;

  private settleTimer = 0;

  private readonly observer: ResizeObserver;

  private readonly stage: Stage;

  private readonly onResize: () => void;

  constructor(stage: Stage, onResize: () => void) {
    this.stage = stage;
    this.onResize = onResize;
    this.width = stage.container.clientWidth;
    this.height = Math.max(1, stage.container.clientHeight);
    this.observer = new ResizeObserver(() => this.observe());
    this.observer.observe(stage.container);
  }

  dispose(): void {
    window.clearTimeout(this.settleTimer);
    this.observer.disconnect();
  }

  private observe(): void {
    const width = this.stage.container.clientWidth;
    const height = Math.max(1, this.stage.container.clientHeight);

    if (width > this.width || height > this.height) {
      this.apply(Math.max(width, window.innerWidth), Math.max(height, window.innerHeight));
    }

    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.settle(), SETTLE_MS);
  }

  private settle(): void {
    const width = this.stage.container.clientWidth;
    const height = Math.max(1, this.stage.container.clientHeight);

    if (width !== this.width || height !== this.height) this.apply(width, height);
  }

  private apply(width: number, height: number): void {
    const { camera, renderer } = this.stage;

    this.width = width;
    this.height = height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    this.onResize();
  }
}
