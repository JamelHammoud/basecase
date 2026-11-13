const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let text = '';

  for (let i = 0; i < bytes.length; i += CHUNK) text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));

  return btoa(text);
}
