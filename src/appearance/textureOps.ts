import { textureAsset, textureAssetHash, serializeTextureAsset, type TextureAsset } from './textureAsset';
import { worldImagePixels } from '../cases/worldImport/image';
import { reply } from '../utils/workerRpc';

export async function decodeTexture(asset: TextureAsset): Promise<ImageBitmap> {
  const checked = textureAsset(asset.texture.bytes);
  const bitmap = await createImageBitmap(
    new Blob([checked.texture.bytes as BlobPart], { type: checked.texture.mimeType }),
    {
      imageOrientation: 'flipY',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    },
  );

  if (bitmap.width * bitmap.height !== worldImagePixels(checked.texture.bytes)) {
    bitmap.close();

    throw new Error('The texture asset is damaged.');
  }

  return bitmap;
}

export const textureHandlers = {
  importTexture: async (file: Blob) => {
    if (file.size > 8 * 1024 * 1024) throw new Error('Choose a texture under 8 MB.');

    const asset = textureAsset(new Uint8Array(await file.arrayBuffer()));
    const hash = await textureAssetHash(asset);
    const bitmap = await decodeTexture(asset);

    return reply({ asset, hash, bitmap, serializedJson: JSON.stringify(serializeTextureAsset(asset)) }, [
      bitmap,
      asset.texture.bytes.buffer as ArrayBuffer,
    ]);
  },
  decodeTexture: async (asset: TextureAsset) => {
    const bitmap = await decodeTexture(asset);

    return reply(bitmap, [bitmap]);
  },
};
