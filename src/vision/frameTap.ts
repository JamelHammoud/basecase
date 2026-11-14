export const VISION_FRAME_MS = 200;

export class VisionFrameTap {
  private port: MessagePort | null = null;

  private cameras = new Set<string>();

  private readonly sent = new Map<string, number>();

  configure(port: MessagePort, cameras: string[]): void {
    this.port?.close();
    this.port = port;
    this.cameras = new Set(cameras);
    this.sent.clear();
  }

  get keys(): string[] {
    return [...this.cameras];
  }

  wants(camera: string): boolean {
    return this.cameras.has(camera) && performance.now() - (this.sent.get(camera) ?? -Infinity) >= VISION_FRAME_MS;
  }

  send(
    camera: string,
    source: ImageBitmapSource,
    timestamp: number,
    metadata?: { mediaTime: number; mediaSource?: string },
  ): void {
    const port = this.port;

    if (!port || !this.wants(camera)) return;

    this.sent.set(camera, performance.now());
    void createImageBitmap(source).then(
      (image) => {
        if (this.port !== port || !this.cameras.has(camera)) return image.close();

        port.postMessage({ camera, image, timestamp, ...metadata }, [image]);
      },
      () => undefined,
    );
  }
}
