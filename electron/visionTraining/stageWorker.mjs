import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { checkedFileId } from '../backend/constants.mjs';
import { checkedHash, contentFile, directory, immutableFile } from './files.mjs';

const MAX_ARCHIVE_BYTES = 192_000_000;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_IMAGES_BYTES = 600 * 1024 * 1024;
const IMAGE = /^images\/(train|val|test)\/[\w-]{1,128}\.jpg$/;
const DEPTH = /^depth\/[\w-]{1,128}\.f32$/;
const MANIFEST = 'basecase/frames.json';

function imageRef(image) {
  checkedHash(image?.id);
  checkedHash(image?.content);

  if (image.packed !== undefined && typeof image.packed !== 'boolean') throw new Error('Check the frozen image format');

  if (image.packed && image.id !== image.content) throw new Error('The frozen image binding must match its hash');

  return image;
}

async function imagesDirectory({ libraryDir, id }) {
  checkedFileId(id);
  await directory(libraryDir, false);

  let dir = libraryDir;

  for (const segment of ['vision-training', 'jobs', id, 'images'])
    dir = await directory(path.join(dir, segment), false);

  return dir;
}

function archiveFilter() {
  const names = new Set();
  let expanded = 0;

  return (entry) => {
    expanded += entry.originalSize;

    if (expanded > MAX_ARCHIVE_BYTES || names.size >= 3 || entry.originalSize > MAX_IMAGE_BYTES)
      throw new Error('The frozen image content exceeds its size limit');

    if (entry.compression !== 0 || entry.size !== entry.originalSize)
      throw new Error('Frozen images need matching stored ZIP sizes');

    if (names.has(entry.name) || !(entry.name === MANIFEST || IMAGE.test(entry.name) || DEPTH.test(entry.name)))
      throw new Error('Check the frozen image ZIP paths');

    names.add(entry.name);

    return true;
  };
}

function frozenJpeg(bytes) {
  const files = unzipSync(bytes, { filter: archiveFilter() });
  const names = Object.keys(files);
  const images = names.filter((name) => IMAGE.test(name));
  const depths = names.filter((name) => DEPTH.test(name));

  if (names.length !== 3 || images.length !== 1 || depths.length !== 1 || !files[MANIFEST])
    throw new Error('The frozen image ZIP needs one image, depth and manifest');

  return files[images[0]];
}

function checkedJpeg(bytes) {
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('The training image is too large');

  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
    throw new Error('Training needs JPEG image content');

  return bytes;
}

async function stage({ libraryDir, id, images }) {
  if (!Array.isArray(images) || images.length > 10_000) throw new Error('Check the training images');

  images.forEach(imageRef);

  const dir = await imagesDirectory({ libraryDir, id });
  let total = 0;

  for (const image of images) {
    const cap = image.packed ? MAX_ARCHIVE_BYTES : MAX_IMAGE_BYTES;
    const bytes = await contentFile(libraryDir, image.content, cap);
    const jpeg = checkedJpeg(image.packed ? frozenJpeg(bytes) : bytes);

    total += jpeg.length;

    if (total > MAX_IMAGES_BYTES) throw new Error('The training images are too large');

    await immutableFile(path.join(dir, `${image.id}.jpg`), jpeg);
  }

  return { images: images.length, bytes: total };
}

try {
  parentPort.postMessage(await stage(workerData));
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : 'Couldn’t stage the training images' });
} finally {
  parentPort.close();
}
