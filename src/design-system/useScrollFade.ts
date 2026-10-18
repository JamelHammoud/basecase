import React, { useEffect, useState } from 'react';

/** Fade height for scroll edges (matches the agent feed) */
export const SCROLL_FADE_PX = 28;

/** Mask that fades an edge only when there's more to scroll to past it (`top`/`bottom` are left/right when `axis` is x) */
export function edgeFadeMask(
  { top, bottom }: { top: boolean; bottom: boolean },
  px = SCROLL_FADE_PX,
  axis: 'x' | 'y' = 'y'
): string | undefined {
  if (!top && !bottom) return undefined;
  const start = top ? `transparent 0, #000 ${px}px` : '#000 0';
  const end = bottom ? `#000 calc(100% - ${px}px), transparent 100%` : '#000 100%';
  return `linear-gradient(to ${axis === 'x' ? 'right' : 'bottom'}, ${start}, ${end})`;
}

/**
 * Soft top/bottom fades for a scroll container (left/right with `axis: 'x'`). Returns a callback `ref` for the container
 * and the `style` to spread on it. Tracks scrolling, resizes, content changes and images
 * loading, so a fade shows exactly when content is hidden past that edge. A callback ref,
 * so it attaches whenever the element mounts (also after the panel first renders without it).
 */
export function useScrollFade<T extends HTMLElement = HTMLDivElement>(
  px = SCROLL_FADE_PX,
  axis: 'x' | 'y' = 'y'
): { ref: (node: T | null) => void; style: React.CSSProperties } {
  const [el, setEl] = useState<T | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    if (!el) return;
    // Cheap reads; state only changes when an edge flips, so scrolling doesn't re-render
    const update = () => {
      const [pos, size, total] =
        axis === 'x' ? [el.scrollLeft, el.clientWidth, el.scrollWidth] : [el.scrollTop, el.clientHeight, el.scrollHeight];
      const top = pos > 1;
      const bottom = pos + size < total - 1;
      setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // Thumbnails change the content height when they load; `load` doesn't bubble, so capture it
    el.addEventListener('load', update, true);
    // Children too: a child that grows (a tab widening on hover) changes the overflow without resizing the container
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
