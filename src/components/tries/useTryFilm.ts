import { useEffect, useRef, useState } from 'react';
import { loadFilm } from '../../cases/tryStore';

const NEAR_VIEW = '200px';

function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;

    const io = new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting)), {
      rootMargin: NEAR_VIEW,
    });

    io.observe(el);

    return () => io.disconnect();
  }, []);

  return { ref, onScreen };
}

export function useTryFilm<T extends Element>(id: string) {
  const { ref, onScreen } = useOnScreen<T>();
  const [film, setFilm] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    if (!onScreen) return;

    let live = true;
    let url: string | null = null;

    void loadFilm(id).then((blob) => {
      if (!live) return;

      url = blob ? URL.createObjectURL(blob) : null;
      setFilm({ id, url: url ?? '' });
    });

    return () => {
      live = false;

      if (url) URL.revokeObjectURL(url);
    };
  }, [onScreen, id]);

  return { ref, src: onScreen && film?.id === id ? film.url : undefined };
}
