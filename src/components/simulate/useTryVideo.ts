import { useEffect, useState } from 'react';
import { loadTryVideo } from '../../cases/tryStore';
import type { TryRecord } from '../../cases/tries';

interface Loaded {
  id: string;
  url: string;
}

export function useTryVideo(record: TryRecord | null): string | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const id = record?.manifest.source === 'operate' ? record.id : null;

  useEffect(() => {
    if (!id) return;

    let live = true;
    let url: string | null = null;

    void loadTryVideo(id)
      .then((blob) => {
        if (!blob || !live) return;

        url = URL.createObjectURL(blob);
        setLoaded({ id, url });
      })
      .catch(() => undefined);

    return () => {
      live = false;

      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  return loaded && loaded.id === id ? loaded.url : null;
}
