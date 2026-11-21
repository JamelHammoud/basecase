import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readCapped, TooLargeError } from './readCapped';

describe('capped renderer streams', () => {
  it('stops gzip expansion before retaining the complete inflated body', async () => {
    const compressed = gzipSync(new Uint8Array(1024 * 1024));
    let inflated = 0;
    const measured = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        inflated += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const body = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).pipeThrough(measured);

    await expect(readCapped(new Response(body), 64 * 1024)).rejects.toBeInstanceOf(TooLargeError);
    expect(inflated).toBeLessThan(1024 * 1024);
  });

  it('cancels at the first excess chunk even with a false content length', async () => {
    let reads = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(32));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );

    await expect(readCapped(new Response(body, { headers: { 'content-length': '1' } }), 64)).rejects.toBeInstanceOf(
      TooLargeError,
    );
    expect(reads).toBe(3);
    expect(cancelled).toBe(true);
    expect(body.locked).toBe(false);
  });

  it('accepts exact limits and empty responses', async () => {
    expect(await readCapped(new Response('four'), 4)).toEqual(new TextEncoder().encode('four').buffer);
    expect((await readCapped(new Response(null), 4)).byteLength).toBe(0);
  });

  it('cancels declared oversized bodies without reading them', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });

    await expect(readCapped(new Response(body, { headers: { 'content-length': '65' } }), 64)).rejects.toBeInstanceOf(
      TooLargeError,
    );
    expect(cancelled).toBe(true);
  });
});
