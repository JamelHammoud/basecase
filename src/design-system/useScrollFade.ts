import React, { useEffect, useState } from 'react';

/** Fade height for scroll edges (matches the agent feed) */
export const SCROLL_FADE_PX = 28;

/** Mask that fades an edge only when there's more to scroll to past it */
export function edgeFadeMask({ top, bottom }: { top: boolean; bottom: boolean }, px = SCROLL_FADE_PX): string | undefined {
  if (!top && !bottom) return undefined;
  const start = top ? `transparent 0, #000 ${px}px` : '#000 0';
  const end = bottom ? `#000 calc(100% - ${px}px), transparent 100%` : '#000 100%';
  return `linear-gradient(to bottom, ${start}, ${end})`;
}

/**
 * Soft top/bottom fades for a scroll container. Returns a callback `ref` for the container
 * and the `style` to spread on it. Tracks scrolling, resizes, content changes and images
 * loading, so a fade shows exactly when content is hidden past that edge. A callback ref,
 * so it attaches whenever the element mounts (also after the panel first renders without it).
 */
export function useScrollFade<T extends HTMLElement = HTMLDivElement>(
  px = SCROLL_FADE_PX
): { ref: (node: T | null) => void; style: React.CSSProperties } {
  const [el, setEl] = useState<T | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    if (!el) return;
    // Cheap reads; state only changes when an edge flips, so scrolling doesn't re-render
    const update = () => {
      const top = el.scrollTop > 1;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // Thumbnails change the content height when they load; `load` doesn't bubble, so capture it
    el.addEventListener('load', update, true);
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const mutations = new MutationObserver(update);
    mutations.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('load', update, true);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [el]);

  const mask = edgeFadeMask(edges, px);
  return { ref: setEl, style: mask ? { maskImage: mask, WebkitMaskImage: mask } : {} };
}
