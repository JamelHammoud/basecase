import * as THREE from 'three';
import { workerClient } from '../utils/workerRpc';
import { getTextureAsset, registerWorldAsset } from '../cases/worldAssets';
import { textureHashes, type Appearance } from './model';
import type { ScenePart } from '../types/robotics';
import { worldImagePixels } from '../cases/worldImport/image';
import { images, trimImages, retainImage, reserveImage, storeImage, imageResources } from './textureImages';
import type { textureHandlers } from './textureOps';
import {
  MAX_TEXTURE_BYTES,
  MAX_TEXTURE_PIXELS,
  textureAsset,
  textureAssetHash,
  type TextureAsset,
} from './textureAsset';

const worker = workerClient<typeof textureHandlers>(
  () => new Worker(new URL('./texture.worker.ts', import.meta.url), { type: 'module' }),
  async () => {
    if (typeof window !== 'undefined') throw new Error('Texture worker is unavailable.');

    return (await import('./textureOps')).textureHandlers;
  },
);

interface TextureEntry {
  texture: THREE.Texture;
  image: NonNullable<ReturnType<typeof images.get>>;
  refs: number;
}

const textures = new Map<string, TextureEntry>();
const pending = new Map<string, Promise<void>>();
const encoded = new Map<string, Blob>();

export async function importTexture(
  file: Blob,
  current: () => boolean = () => true,
  validate: (candidate: { hash: string; asset: TextureAsset }) => void = () => {},
): Promise<string | null> {
  if (file.size > MAX_TEXTURE_BYTES) throw new Error('Choose a texture under 8 MB.');

  const release = reserveImage(MAX_TEXTURE_PIXELS);
  const result = await worker.call('importTexture', file).finally(release);
  const { hash, asset, bitmap, serializedJson } = result;

  if (!current()) {
    bitmap.close();

    return null;
  }

  try {
    validate({ hash, asset });
    registerWorldAsset(hash, asset, serializedJson);
  } catch (error) {
    bitmap.close();

    throw error;
  }

  storeImage(hash, bitmap);

  return hash;
}

export function provideTextureBlob(hash: string, blob: Blob): void {
  if (blob.size > MAX_TEXTURE_BYTES) throw new Error('Choose a texture under 8 MB.');

  if (getTextureAsset(hash)) return;

  const stagedBytes = [...encoded.values()].reduce((sum, entry) => sum + entry.size, 0);

  if (stagedBytes - (encoded.get(hash)?.size ?? 0) + blob.size > 256 * 1024 * 1024)
    throw new Error('Texture memory is full.');

  encoded.set(hash, blob);
}

async function loadTextureAsset(hash: string): Promise<TextureAsset | undefined> {
  const known = getTextureAsset(hash);

  if (known) return known;

  const blob = encoded.get(hash);

  if (!blob) return undefined;

  encoded.delete(hash);

  const asset = textureAsset(new Uint8Array(await blob.arrayBuffer()));

  if ((await textureAssetHash(asset)) !== hash) throw new Error('The texture hash does not match its content.');

  registerWorldAsset(hash, asset);

  return asset;
}

export function prepareTexture(hash: string): Promise<void> | null {
  if (images.has(hash)) return null;

  if (!getTextureAsset(hash) && !encoded.has(hash)) return null;

  const existing = pending.get(hash);

  if (existing) return existing;

  const job = loadTextureAsset(hash)
    .then(async (asset) => {
      if (!asset) throw new Error('The texture asset is damaged.');

      const release = reserveImage(worldImagePixels(asset.texture.bytes));

      try {
        const bitmap =
          typeof document === 'undefined'
            ? await (await import('./textureOps')).decodeTexture(asset)
            : await worker.call('decodeTexture', asset);

        release();
        storeImage(hash, bitmap);
      } finally {
        release();
      }
    })
    .finally(() => pending.delete(hash));

  pending.set(hash, job);

  return job;
}

export function prepareAppearance(parts: ScenePart[]) {
  const hashes = textureHashes(parts);
  const releases = hashes.map(retainImage);
  const jobs = hashes.map(prepareTexture).filter((job) => job !== null);
  let preparing = jobs.length > 0;
  const ready = preparing
    ? Promise.allSettled(jobs)
        .then((results) => {
          const failed = results.find((result) => result.status === 'rejected');

          if (failed?.status === 'rejected') throw failed.reason;
        })
        .finally(() => {
          preparing = false;
        })
    : null;

  return {
    ready,
    get pending() {
      return preparing;
    },
    release: () => releases.forEach((release) => release()),
  };
}

export function acquireTexture(
  hash: string,
  appearance: Appearance,
  color: boolean,
): { texture: THREE.Texture; release: () => void } | null {
  const image = images.get(hash);

  if (!image) return null;

  const key = JSON.stringify([hash, appearance.mapping, color]);
  let entry = textures.get(key);

  if (!entry) {
    const texture = new THREE.Texture();

    texture.needsUpdate = true;

    image.source ??= new THREE.Source(image.bitmap);
    texture.source = image.source;

    const { mapping } = appearance;
    const scale = mapping.kind === 'uv' ? 1 / mapping.scale : 1;

    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(scale, scale);
    texture.rotation = THREE.MathUtils.degToRad(mapping.rotation);
    entry = { texture, image, refs: 0 };
    textures.set(key, entry);
    image.refs++;
  }

  entry.refs++;

  let released = false;
  const owned = entry;

  return {
    texture: owned.texture,
    release: () => {
      if (released) return;

      released = true;
      owned.refs--;

      if (owned.refs) return;

      textures.delete(key);
      owned.texture.dispose();
      owned.image.refs--;
      trimImages();
    },
  };
}

export const textureResources = () => ({ ...imageResources(), textures: textures.size });
