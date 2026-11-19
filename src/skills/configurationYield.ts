export class ConfigurationYield {
  private readonly channel = new MessageChannel();
  private resume: (() => void) | null = null;

  constructor() {
    this.channel.port1.onmessage = () => this.resume?.();
  }

  wait(): Promise<void> {
    return new Promise<void>((resolve) => {
      const immediate = (globalThis as { setImmediate?: (callback: () => void) => unknown }).setImmediate;

      if (immediate) {
        immediate(resolve);

        return;
      }

      this.resume = resolve;
      this.channel.port2.postMessage(null);
    });
  }

  dispose() {
    this.channel.port1.close();
    this.channel.port2.close();
  }
}
