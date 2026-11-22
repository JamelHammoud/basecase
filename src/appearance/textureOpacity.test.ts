import { expect, it } from 'vitest';
import { colorTexture } from './colorTextures.fixtures';
import { opaqueTexture } from './textureOpacity';

it('classifies encoded opaque color maps conservatively without decoding pixels', () => {
  const rgb = colorTexture('rgb');
  const rgba = colorTexture('rgba');

  expect(opaqueTexture(rgb)).toBe(true);
  expect(opaqueTexture(rgba)).toBe(false);
  expect(opaqueTexture(colorTexture('palette'))).toBe(false);
  expect(opaqueTexture({ ...rgb, texture: { ...rgb.texture, bytes: rgb.texture.bytes.subarray(0, 40) } })).toBe(false);
  expect(opaqueTexture({ ...rgb, texture: { ...rgb.texture, mimeType: 'image/webp' } })).toBe(false);
});
