import { useEffect, useState } from 'react';
import { loadStrip } from '../../cases/tryStore';

export function useStoredStrip(id: string, held: boolean) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!held) return;

    let live = true;

    void loadStrip(id).then(
      (blob) => {
        if (live && blob) setUrl(URL.createObjectURL(blob));
      },
      () => {},
    );

    return () => {
      live = false;
    };
  }, [id, held]);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return url;
}
