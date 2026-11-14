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

    void loadFilm(id).then((blob) => {
      if (live) setFilm({ id, url: blob ? URL.createObjectURL(blob) : '' });
    });

    return () => {
      live = false;
      setFilm(null);
    };
  }, [onScreen, id]);

  useEffect(
    () => () => {
      if (film?.url) URL.revokeObjectURL(film.url);
    },
    [film],
  );

  return { ref, src: onScreen && film?.id === id ? film.url : undefined };
}
