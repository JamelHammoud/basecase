import React, { useEffect, useEffectEvent, useLayoutEffect, useState } from 'react';

const FADE_PX = 24;

function fadeMask({ left, right }: { left: boolean; right: boolean }) {
  if (!left && !right) return undefined;

  const start = left ? `transparent, #000 ${FADE_PX}px` : '#000';
  const end = right ? `#000 calc(100% - ${FADE_PX}px), transparent` : '#000';

  return `linear-gradient(to right, ${start}, ${end})`;
}

export function useTabsFade({
  lastTabId,
  tabEls,
  scrollerRef,
}: {
  lastTabId: string;
  tabEls: React.RefObject<Map<string, HTMLDivElement>>;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [fade, setFade] = useState({ left: false, right: false });

  const measureFade = useEffectEvent(() => {
    const el = scrollerRef.current;
    const last = tabEls.current.get(lastTabId);

    if (!el || !last) return;

    const contentRight = last.offsetLeft + last.offsetWidth;
    const next = { left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < contentRight - 1 };

    setFade((f) => (f.left === next.left && f.right === next.right ? f : next));
  });

  useLayoutEffect(() => {
    measureFade();
  });

  useEffect(() => {
    const el = scrollerRef.current;

    if (!el) return;

    const update = () => measureFade();

    el.addEventListener('scroll', update, { passive: true });

    const ro = new ResizeObserver(update);

    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [scrollerRef]);

  return fadeMask(fade);
}
