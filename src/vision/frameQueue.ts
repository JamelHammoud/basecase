import type { VisionFrame } from './protocol';

export class VisionFrameQueue {
  private pending = new Map<string, VisionFrame>();
  private active: Promise<void> | null = null;
  private disposed = false;
  private run: (frame: VisionFrame) => Promise<void>;
  private error: (error: unknown, frame: VisionFrame) => void;

  constructor(
    run: (frame: VisionFrame) => Promise<void>,
    error: (error: unknown, frame: VisionFrame) => void = () => undefined,
  ) {
    this.run = run;
    this.error = error;
  }

  push(frame: VisionFrame): void {
    if (this.disposed) {
      frame.image.close();

      return;
    }

    this.pending.get(frame.camera)?.image.close();
    this.pending.set(frame.camera, frame);
    this.active ??= this.drain().finally(() => {
      this.active = null;
    });
  }

  private async drain(): Promise<void> {
    while (this.pending.size) {
      const frame = this.pending.values().next().value;

      if (!frame) return;

      this.pending.delete(frame.camera);

      try {
        await this.run(frame);
      } catch (error) {
        this.error(error, frame);
      } finally {
        frame.image.close();
      }
    }
  }

  async idle(): Promise<void> {
    await this.active;
  }

  dispose(): void {
    this.disposed = true;

    for (const frame of this.pending.values()) frame.image.close();

    this.pending.clear();
  }
}
