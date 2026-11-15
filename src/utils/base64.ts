const CHUNK = 0x8000;

type Base64Bytes = Uint8Array & { toBase64?: () => string };

type Base64Constructor = typeof Uint8Array & { fromBase64?: (text: string) => Uint8Array<ArrayBuffer> };

export function bytesToBase64(bytes: Uint8Array): string {
  const native = bytes as Base64Bytes;

  if (native.toBase64) return native.toBase64();

  let text = '';

  for (let i = 0; i < bytes.length; i += CHUNK) text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));

  return btoa(text);
}

export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const native = Uint8Array as Base64Constructor;

  if (native.fromBase64) return native.fromBase64(text);

  const bin = atob(text);
  const out = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);

  return out;
}
