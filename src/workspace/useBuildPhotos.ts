import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Session } from './buildAlongSession';
import { localBuildPhotos } from '../kit/buildPhotos';
import { photoClient } from '../kit/photoClient';
import type { BuildPhoto, PhotoDestination } from '../kit/photoRecords';
import { pickFiles } from '../utils/pickFiles';
import { errorMessage } from '../utils/errorMessage';
import type { ShowToast } from './types';

export function useBuildPhotos(session: Session | null, showToast: ShowToast) {
  const record = session?.frozen?.record;
  const step = session?.index ?? 0;
  const build = record?.id;
  const kit = record?.kit;
  const key = record ? `${record.id}:${record.kit}:${step}` : '';
  const [saved, setSaved] = useState<{ key: string; records: BuildPhoto[] }>({ key: '', records: [] });
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const reportFailure = useEffectEvent((error: unknown) => showToast(errorMessage(error), { tone: 'error' }));

  useEffect(() => {
    let current = true;

    if (build && kit)
      void localBuildPhotos
        .list({ build, kit, step })
        .then((records) => {
          if (current) setSaved({ key, records });
        })
        .catch((error: unknown) => {
          if (current) reportFailure(error);
        });

    return () => {
      current = false;
      abort.current?.abort();
    };
  }, [key, build, kit, step]);

  const importPhotos = async () => {
    if (!record || abort.current) return;

    const destination: PhotoDestination = { build: record.id, kit: record.kit, step };
    const controller = new AbortController();
    const client = photoClient();

    abort.current = controller;
    setBusy(true);
    controller.signal.addEventListener('abort', client.dispose, { once: true });

    try {
      const files = await pickFiles('image/png,image/jpeg', true);

      controller.signal.throwIfAborted();

      for (const file of files) {
        const content = await client.call('prepare', file);

        await localBuildPhotos.attach(destination, content, controller.signal, {
          name: file.name,
          modified: file.lastModified,
        });
        controller.signal.throwIfAborted();

        const records = await localBuildPhotos.list(destination);

        controller.signal.throwIfAborted();
        setSaved({ key, records });
      }
    } catch (error) {
      if (!controller.signal.aborted) showToast(errorMessage(error), { tone: 'error' });
    } finally {
      controller.signal.removeEventListener('abort', client.dispose);
      client.dispose();
      abort.current = null;
      setBusy(false);
    }
  };
  const remove = async (photo: BuildPhoto) => {
    try {
      await localBuildPhotos.remove(photo.id);
      setSaved((current) => ({ ...current, records: current.records.filter((item) => item.id !== photo.id) }));
    } catch (error) {
      showToast(errorMessage(error), { tone: 'error' });
    }
  };

  return {
    key,
    records: saved.key === key ? saved.records : [],
    busy,
    importPhotos,
    remove,
    cancel: () => abort.current?.abort(),
  };
}

export type BuildPhotos = ReturnType<typeof useBuildPhotos>;
