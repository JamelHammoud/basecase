interface FramePipeline<T> {
  decode: (time: number) => Promise<T>;
  paint: (frame: T, time: number) => void;
  error: (error: unknown) => void;
}

export class PlayheadFrames<T> {
  private requested = -1;

  private busy = false;

  private closed = false;

  private readonly pipeline: FramePipeline<T>;

  constructor(pipeline: FramePipeline<T>) {
    this.pipeline = pipeline;
  }

  seek(time: number): void {
    if (this.closed || !Number.isFinite(time) || time < 0 || time === this.requested) return;

    this.requested = time;
    void this.drain();
  }

  close(): void {
    this.closed = true;
  }

  private async drain(): Promise<void> {
    if (this.busy || this.closed) return;

    this.busy = true;

    let at = this.requested;

    try {
      do {
        at = this.requested;

        const frame = await this.pipeline.decode(at);

        if (!this.closed && at === this.requested) this.pipeline.paint(frame, at);
      } while (!this.closed && at !== this.requested);
    } catch (error) {
      if (!this.closed) this.pipeline.error(error);
    } finally {
      this.busy = false;

      if (!this.closed && at !== this.requested) void this.drain();
    }
  }
}
