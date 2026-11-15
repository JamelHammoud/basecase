import type { VisionArtifact } from './manifest';

export async function verifyModelBytes(bytes: Uint8Array, model: VisionArtifact) {
  if (bytes.byteLength !== model.bytes) throw new Error('The model size does not match the manifest.');

  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer));
  const sha = Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');

  if (sha !== model.sha256) throw new Error('The model hash does not match the manifest.');

  return bytes;
}
