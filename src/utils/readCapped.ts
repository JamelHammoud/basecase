export class TooLargeError extends Error {}

export async function readCapped(res: Response, maxBytes: number): Promise<ArrayBuffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Expected a finite byte limit');

  if (Number(res.headers.get('content-length')) > maxBytes) {
    await res.body?.cancel().catch(() => undefined);

    throw new TooLargeError();
  }

  if (!res.body) return new ArrayBuffer(0);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      total += next.value.byteLength;

      if (total > maxBytes) throw new TooLargeError();

      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);

    throw error;
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let at = 0;

  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }

  return out.buffer;
}
