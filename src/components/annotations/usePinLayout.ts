import React, { useEffect, useRef } from 'react';
import type { Viewport3DHandle } from '../Viewport3D';
import { watchPinLayout, type LayoutState } from './pinLayout';

export { CARD_WIDTH, DRAFT_KEY } from './pinLayout';

export function usePinLayout({
  viewportRef,
  ...state
}: LayoutState & { viewportRef: React.RefObject<Viewport3DHandle | null> }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pinRefs = useRef(new Map<string, HTMLElement>());
  const { shown, parts, draft, activeId } = state;

  useEffect(() => {
    const viewport = viewportRef.current;
    const layer = layerRef.current;

    if (!viewport || !layer) return;

    return watchPinLayout(
      viewport,
      { shown, parts, draft, activeId },
      {
        layer,
        card: cardRef.current,
        pins: pinRefs.current,
      },
    );
  }, [viewportRef, shown, parts, draft, activeId]);

  const trackPin = (key: string, el: HTMLElement | null) => {
    if (el) pinRefs.current.set(key, el);
    else pinRefs.current.delete(key);
  };

  const ownsTarget = (t: Node) => {
    if (cardRef.current?.contains(t)) return true;

    return [...pinRefs.current.values()].some((el) => el.contains(t));
  };

  return { layerRef, cardRef, trackPin, ownsTarget };
}
