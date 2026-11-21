import { buildStorage } from './buildStorage';
import type { BuildStorage } from './buildRecords';
import type { BuildPhotoImage } from './photoImage';
import { photoClient } from './photoClient';
import {
  checkedPhotoDestination,
  OBSERVATION_LIMITS,
  photoIndex,
  photoHistoryError,
  photoKey,
  photoName,
  prunePhotos,
  samePhotoStep,
  type BuildPhoto,
  type PhotoDestination,
} from './photoRecords';

async function verified(image: BuildPhotoImage) {
  const client = photoClient();

  try {
    return await client.call('verify', image);
  } finally {
    client.dispose();
  }
}

export function createBuildPhotos(storage: BuildStorage, limits = OBSERVATION_LIMITS) {
  const list = async (destination: PhotoDestination) =>
    photoIndex(await storage.get('observations')).records.filter((record) => samePhotoStep(record, destination));
  const image = async (hash: string) => {
    const content = (await storage.get(photoKey(hash))) as BuildPhotoImage | undefined;

    if (content?.hash !== hash) throw photoHistoryError();

    return verified(content);
  };
  const attach = async (
    destination: PhotoDestination,
    input: BuildPhotoImage,
    signal?: AbortSignal,
    metadata = { name: 'Photo', modified: 0 },
  ) => {
    const target = { ...destination };
    const name = photoName(metadata.name);
    const suppliedModifiedAt =
      metadata.modified > 0 && metadata.modified <= 8.64e15 ? new Date(metadata.modified).toISOString() : undefined;

    signal?.throwIfAborted();

    const content = await verified(input);
    const record: BuildPhoto = {
      ...target,
      id: crypto.randomUUID(),
      hash: content.hash,
      name,
      importedAt: new Date().toISOString(),
      suppliedModifiedAt,
    };

    return storage.update(
      ['observations', `build:${target.build}`],
      ([value, saved]) => {
        signal?.throwIfAborted();
        checkedPhotoDestination(saved, target);

        const index = photoIndex(value);
        const stepPhotos = index.records.filter((item) => samePhotoStep(item, target));
        const duplicate = stepPhotos.find((item) => item.hash === content.hash);

        if (duplicate) return { puts: {}, result: duplicate };

        const assets = { ...index.assets, [content.hash]: index.assets[content.hash] ?? content.bytes };

        if (
          index.records.length >= limits.maxPhotos ||
          stepPhotos.length >= limits.perStep ||
          Object.values(assets).reduce((sum, bytes) => sum + bytes, 0) > limits.maxBytes
        )
          throw new Error('Photo storage is full. Delete a photo to make room.');

        return {
          puts: {
            observations: { records: [...index.records, record], assets },
            ...(!index.assets[content.hash] ? { [photoKey(content.hash)]: content } : {}),
          },
          result: record,
        };
      },
      signal,
    );
  };
  const remove = (id: string) =>
    storage.update(['observations'], ([value]) => ({
      ...prunePhotos(photoIndex(value), (record) => record.id !== id),
      result: undefined,
    }));

  return { list, image, attach, remove };
}

export const localBuildPhotos = createBuildPhotos(buildStorage);
