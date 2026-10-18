import React, { useEffect, useState } from 'react';

export const SCROLL_FADE_PX = 28;

export function edgeFadeMask(
  { top, bottom }: { top: boolean; bottom: boolean },
  px = SCROLL_FADE_PX,
  axis: 'x' | 'y' = 'y',
): string | undefined {
  if (!top && !bottom) return undefined;

  const start = top ? `transparent 0, #000 ${px}px` : '#000 0';
  const end = bottom ? `#000 calc(100% - ${px}px), transparent 100%` : '#000 100%';

  return `linear-gradient(to ${axis === 'x' ? 'right' : 'bottom'}, ${start}, ${end})`;
}

export function useScrollFade<T extends HTMLElement = HTMLDivElement>(
  px = SCROLL_FADE_PX,
  axis: 'x' | 'y' = 'y',
): { ref: (node: T | null) => void; style: React.CSSProperties } {
  const [el, setEl] = useState<T | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    if (!el) return;

    const update = () => {
      const [pos, size, total] =
        axis === 'x'
          ? [el.scrollLeft, el.clientWidth, el.scrollWidth]
          : [el.scrollTop, el.clientHeight, el.scrollHeight];
      const top = pos > 1;
      const bottom = pos + size < total - 1;

      setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('load', update, true);

    const resize = new ResizeObserver(update);
    const observe = () => {
      resize.disconnect();
      resize.observe(el);

      for (const child of el.children) resize.observe(child);
    };

    observe();

    const mutations = new MutationObserver(() => {
      observe();
      update();
    });

    mutations.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('load', update, true);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [el, axis]);

  const mask = edgeFadeMask(edges, px, axis);

  return { ref: setEl, style: mask ? { maskImage: mask, WebkitMaskImage: mask } : {} };
}
