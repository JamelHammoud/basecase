import { refuse } from './validate';
import type { WorldAsset } from './worldAssets';
import { readWorldImage, worldImagePixels } from './worldImport/image';
import { readSplat } from './worldImport/splat';

export async function validateWorldAssetPayloads({ world }: WorldAsset): Promise<void> {
  let pixels = 0;

  for (const material of world.mesh.materials) {
    const image = material.image;

    if (!image) continue;

    const actual = readWorldImage(image.bytes, image.flipY ?? false);

    pixels += worldImagePixels(image.bytes);

    if (pixels > 16_777_216 || actual.mimeType !== image.mimeType)
      refuse('World texture', 'has mismatched metadata or exceeds 16 million pixels');
  }

  if (!world.splat) return;

  const actual = await readSplat(world.splat);

  if (actual.count !== world.splat.count || actual.format !== world.splat.format)
    refuse('World splat metadata', 'does not match its encoded payload');

  if (
    actual.bytes.length !== world.splat.bytes.length ||
    actual.bytes.some((value, i) => value !== world.splat!.bytes[i])
  )
    refuse('World splat', 'needs canonical binary PLY data');
}
