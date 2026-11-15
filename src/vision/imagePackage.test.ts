import { describe, expect, it } from 'vitest';
import { jsonBytes, readDepth } from './imageBytes';
import { readImagePackage } from './imagePackage';

function packageFiles() {
  return {
    'basecase/frames.json': jsonBytes({
      version: 1,
      id: 'set',
      name: 'Set',
      sceneId: null,
      caseId: null,
      seed: 1,
      classes: [],
      createdAt: 'now',
      depthUnit: 'mm',
      depthEncoding: 'float32-le-radial',
      frames: [{ image: 'images/train/frame.jpg', depthFile: 'depth/frame.f32' }],
    }),
    'images/train/frame.jpg': new Uint8Array([255, 216, 255, 217]),
    'depth/frame.f32': new Uint8Array(4),
  };
}

describe('image package boundaries', () => {
  it('rejects oversized image files before checksumming or copying their bytes', () => {
    const files = packageFiles();

    Object.defineProperty(files['images/train/frame.jpg'], 'length', { value: 67_108_865 });

    expect(() => readImagePackage(files)).toThrow('size limit');
  });

  it('rejects oversized depth before allocating decoded pixels', () => {
    const depth = new Uint8Array(4);

    Object.defineProperty(depth, 'length', { value: 67_108_868 });

    expect(() => readDepth(depth)).toThrow('depth image size');
  });

  it.each(['../frame.jpg', '/images/train/frame.jpg', 'images/train/../../frame.jpg', 'images\\train\\frame.jpg'])(
    'rejects an image path outside the package layout: %s',
    (image) => {
      const files = packageFiles();
      const metadata = JSON.parse(new TextDecoder().decode(files['basecase/frames.json']));

      metadata.frames[0].image = image;
      files['basecase/frames.json'] = jsonBytes(metadata);

      expect(() => readImagePackage(files)).toThrow('package files');
    },
  );
});
