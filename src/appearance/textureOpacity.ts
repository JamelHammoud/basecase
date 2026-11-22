import type { TextureAsset } from './textureAsset';

export function opaqueTexture(asset: TextureAsset | undefined): boolean {
  if (!asset) return false;

  const { bytes, mimeType } = asset.texture;

  if (mimeType === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216;

  if (mimeType !== 'image/png' || bytes.length < 33 || ![0, 2, 3].includes(bytes[25])) return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a || view.getUint32(12) !== 0x49484452)
    return false;

  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    const tag = view.getUint32(offset + 4);

    if (offset + length + 12 > bytes.length || tag === 0x74524e53) return false;

    if (tag === 0x49454e44) return length === 0;

    offset += length + 12;
  }

  return false;
}
