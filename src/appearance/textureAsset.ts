import { base64ToBytes, bytesToBase64 } from '../utils/base64';
import { readWorldImage, worldImagePixels } from '../cases/worldImport/image';
import { isWorldAssetHash } from '../cases/worldAssetHash';
import { opaqueTexture } from './textureOpacity';

export interface TextureAsset {
  opaque?: boolean;
  encoded: Blob;
  texture: { bytes: Uint8Array; mimeType: string };
}

export interface SerializedTextureAsset {
  texture: { bytes: string; mimeType: string };
}

export const MAX_TEXTURE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXTURE_PIXELS = 4_194_304;
export const MAX_SCENE_TEXTURE_PIXELS = 8_388_608;
export const MAX_SCENE_TEXTURE_BYTES = 32 * 1024 * 1024;

export function textureAsset(bytes: Uint8Array): TextureAsset {
  if (bytes.byteLength > MAX_TEXTURE_BYTES) throw new Error('Choose a texture under 8 MB.');

  const image = readWorldImage(bytes, false);

  if (worldImagePixels(bytes) > MAX_TEXTURE_PIXELS) throw new Error('Choose a texture under 4 million pixels.');

  const asset: TextureAsset = {
    texture: { bytes, mimeType: image.mimeType },
    encoded: new Blob([bytes as BlobPart], { type: image.mimeType }),
  };

  asset.opaque = opaqueTexture(asset);

  return asset;
}

export const serializeTextureAsset = ({ texture }: TextureAsset): SerializedTextureAsset => ({
  texture: { bytes: bytesToBase64(texture.bytes), mimeType: texture.mimeType },
});

export async function textureAssetHash(asset: TextureAsset): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', asset.texture.bytes as Uint8Array<ArrayBuffer>);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readTextureAsset(hash: string, raw: unknown): Promise<TextureAsset> {
  const value = raw as Partial<SerializedTextureAsset> | null;
  const encoded = value?.texture?.bytes;

  if (
    !isWorldAssetHash(hash) ||
    typeof encoded !== 'string' ||
    encoded.length > Math.ceil(MAX_TEXTURE_BYTES / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  )
    throw new Error('The texture asset is damaged.');

  const asset = textureAsset(base64ToBytes(encoded));

  if (asset.texture.mimeType !== value?.texture?.mimeType || (await textureAssetHash(asset)) !== hash)
    throw new Error('The texture hash does not match its content.');

  if (typeof createImageBitmap !== 'undefined') {
    const bitmap = await (await import('./textureOps')).decodeTexture(asset);

    bitmap.close();
  }

  return asset;
}

export function assertTextureBudget(bytes: number, pixels: number): void {
  if (bytes > MAX_SCENE_TEXTURE_BYTES) throw new Error('Keep scene textures under 32 MB.');

  if (pixels > MAX_SCENE_TEXTURE_PIXELS) throw new Error('Keep scene textures under 8 million pixels.');
}
