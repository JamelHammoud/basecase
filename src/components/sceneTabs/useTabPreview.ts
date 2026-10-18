import React, { useEffect, useRef, useState } from 'react';

const PREVIEW_DELAY_MS = 800;

export const PREVIEW_WIDTH = 240;

export interface TabPreviewSpot {
  id: string;
  left: number;
  top: number;
}

export function useTabPreview({
  tabEls,
  onPreview,
}: {
  tabEls: React.RefObject<Map<string, HTMLDivElement>>;
  onPreview?: (id: string) => void;
}) {
  const [preview, setPreview] = useState<TabPreviewSpot | null>(null);
  const previewTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
    },
    [],
  );

  const hidePreview = () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);

    previewTimer.current = null;
    setPreview(null);
  };

  const queuePreview = (id: string, blocked: boolean) => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);

    if (blocked) {
      setPreview(null);

      return;
    }

    const open = () => {
      const r = tabEls.current.get(id)?.getBoundingClientRect();

      if (!r) return;

      const left = Math.max(8, Math.min(r.left, window.innerWidth - PREVIEW_WIDTH - 8));

      setPreview({ id, left, top: r.bottom + 8 });
      onPreview?.(id);
    };

    if (preview) open();
    else previewTimer.current = window.setTimeout(open, PREVIEW_DELAY_MS);
  };

  return { preview, hidePreview, queuePreview };
}
