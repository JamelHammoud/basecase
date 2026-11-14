import type { FrameSet } from './frameSet';
import { validateFrameSet, validateFrameSetHeader } from './frameSet';
import { byteChecksum, depthBytes, jsonBytes, readDepth, readJson } from './imageBytes';
import { imageSplit, IMAGE_SPLITS, splitFolder } from './imageSplit';

export type ImageFiles = Record<string, Uint8Array>;

export function imagePackage(set: FrameSet): ImageFiles {
  validateFrameSet(set);

  const files: ImageFiles = {};
  const splits = imageSplit(set);
  const folders = new Map(
    IMAGE_SPLITS.flatMap((split) => splits[split].map((id) => [id, splitFolder(split)] as const)),
  );
  const frames = set.frames.map(({ jpeg, depth, ...frame }) => {
    const image = `images/${folders.get(frame.id)}/${frame.id}.jpg`;
    const depthFile = `depth/${frame.id}.f32`;

    files[image] = jpeg.slice();
    files[depthFile] = depthBytes(depth);

    return {
      ...frame,
      image,
      depthFile,
      imageChecksum: byteChecksum(jpeg),
      depthChecksum: byteChecksum(files[depthFile]),
    };
  });

  files['basecase/frames.json'] = jsonBytes({ ...set, frames, depthUnit: 'mm', depthEncoding: 'float32-le-radial' });

  return files;
}

function fileAt(files: ImageFiles, path: unknown): Uint8Array {
  if (
    typeof path !== 'string' ||
    !/^(images\/(train|val|test)\/[\w-]{1,128}\.jpg|depth\/[\w-]{1,128}\.f32)$/.test(path) ||
    !(files[path] instanceof Uint8Array)
  )
    throw new Error('Check the image package files.');

  if (files[path].length > 67_108_864) throw new Error('The image package file exceeds its size limit.');

  return files[path];
}

export function readImagePackage(files: ImageFiles): FrameSet {
  if (!(files['basecase/frames.json'] instanceof Uint8Array) || files['basecase/frames.json'].length > 64_000_000) {
    throw new Error('Check the image package manifest.');
  }

  const metadata = readJson(files['basecase/frames.json']);

  if (
    metadata?.version !== 1 ||
    !Array.isArray(metadata.frames) ||
    metadata.frames.length > 100_000 ||
    metadata.depthUnit !== 'mm' ||
    metadata.depthEncoding !== 'float32-le-radial'
  ) {
    throw new Error('Check the image package version.');
  }

  validateFrameSetHeader({ ...metadata });

  const { depthUnit, depthEncoding, ...set } = metadata;

  void depthUnit;
  void depthEncoding;

  const frames = metadata.frames.map((frame: Record<string, unknown>) => {
    const { image, depthFile, imageChecksum, depthChecksum, ...rest } = frame;
    const jpeg = fileAt(files, image);
    const bytes = fileAt(files, depthFile);

    if (byteChecksum(jpeg) !== imageChecksum || byteChecksum(bytes) !== depthChecksum) {
      throw new Error('The image package bytes changed.');
    }

    return { ...rest, jpeg: jpeg.slice(), depth: readDepth(bytes) };
  });
  const restored = { ...set, frames };

  validateFrameSet(restored);

  return restored;
}

export function verifyImageFiles(expected: ImageFiles, received: ImageFiles): void {
  const match = Object.entries(expected).every(
    ([path, bytes]) =>
      received[path] instanceof Uint8Array &&
      bytes.length === received[path].length &&
      bytes.every((byte, i) => byte === received[path][i]),
  );

  if (!match) throw new Error('The image package labels changed.');
}
