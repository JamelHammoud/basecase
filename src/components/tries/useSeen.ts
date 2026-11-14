import { useEffect, useState, type RefObject } from 'react';

export function useSeen(ref: RefObject<Element | null>) {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;

    if (seen || !el) return;

    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), {
      rootMargin: '400px',
    });

    io.observe(el);

    return () => io.disconnect();
  }, [ref, seen]);

  return seen;
}
