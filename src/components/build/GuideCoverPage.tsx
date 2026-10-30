import React, { useEffect, useRef } from 'react';
import type { GuidePages } from '../../guide/viewer/guidePages';
import { PAGE_W_PX, pageCopy } from '../../guide/viewer/pageStack';

interface GuideCoverPageProps {
  guide: GuidePages;
  widthPx: number;
  heroSrc?: string;
}

function fillHero(img: Element, src: string) {
  img.setAttribute('src', src);
  img.setAttribute('style', 'width: 100%; height: 100%; object-fit: contain;');
}

export const GuideCoverPage: React.FC<GuideCoverPageProps> = ({ guide, widthPx, heroSrc }) => {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const slot = pageCopy(guide, 0);

    if (!slot || !host.current) return undefined;

    if (heroSrc) slot.shadowRoot?.querySelectorAll('.hero img').forEach((img) => fillHero(img, heroSrc));

    slot.style.transform = `scale(${widthPx / PAGE_W_PX})`;
    host.current.append(slot);

    return () => slot.remove();
  }, [guide, heroSrc, widthPx]);

  return (
    <div
      ref={host}
      aria-hidden
      className="absolute inset-0 bg-white pointer-events-none animate-fade-in"
      style={{ willChange: 'transform', contain: 'strict' }}
    />
  );
};
