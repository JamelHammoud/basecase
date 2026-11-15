import type { Page } from 'playwright-core';

export async function recordLightenTiming(page: Page) {
  await page.evaluate(() => {
    const target = window as unknown as { __lightenTimings: number[]; __lightenFinished: Promise<void> };
    const post = Worker.prototype.postMessage;
    let finish: () => void;

    target.__lightenTimings = [];
    target.__lightenFinished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    Worker.prototype.postMessage = function (
      message: unknown,
      options: StructuredSerializeOptions | Transferable[] = [],
    ) {
      const request = message as { id: number; payload?: { task?: { kind?: string } } };
      const send = Array.isArray(options) ? { transfer: options } : options;

      if (request?.payload?.task?.kind !== 'lighten') return post.call(this, message, send);

      const measured = ({ data }: MessageEvent<{ id: number; result?: { ms: number } }>) => {
        if (data.id !== request.id) return;

        this.removeEventListener('message', measured);

        if (data.result) target.__lightenTimings.push(data.result.ms);

        finish();
      };

      this.addEventListener('message', measured);

      return post.call(this, message, send);
    };
  });
}

export const lightenTimings = (page: Page) =>
  page.evaluate(() => (window as unknown as { __lightenTimings: number[] }).__lightenTimings);

export const waitForLighten = (page: Page) =>
  page.evaluate(() => (window as unknown as { __lightenFinished: Promise<void> }).__lightenFinished);
