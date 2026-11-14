import { useEffect, useRef, useState } from 'react';
import { tryFilm } from '../../cases/tryStore';

const AHEAD = '400px';

export function useTryFilm(id: string) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [seen, setSeen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;

    if (!el || seen) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: AHEAD },
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen) return;

    let live = true;
    let made: string | null = null;

    void tryFilm(id)
      .catch(() => null)
      .then((blob) => {
        if (!live || !blob) return;

        made = URL.createObjectURL(blob);
        setUrl(made);
      });

    return () => {
      live = false;

      if (made) URL.revokeObjectURL(made);
    };
  }, [id, seen]);

  return { ref, url };
}
