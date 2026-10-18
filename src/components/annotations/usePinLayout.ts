import React, { useEffect, useRef } from 'react';
import { SceneAnnotation, ScenePart } from '../../types/robotics';
import { annotationWorldPosition } from '../../utils/aiHandoff';
import type { Viewport3DHandle } from '../Viewport3D';

export const CARD_WIDTH = 320;
export const DRAFT_KEY = '__draft__';

type ScreenPoint = { x: number; y: number; visible: boolean };

interface LayoutState {
  shown: SceneAnnotation[];
  parts: ScenePart[];
  draft: { position: [number, number, number] } | null;
  activeId: string | null;
}

function cardOffset(anchor: ScreenPoint, layer: { width: number; height: number }, cardHeight: number) {
  const flipped = anchor.x + 42 + CARD_WIDTH > layer.width - 12;
  const left = Math.max(12, flipped ? anchor.x - 12 - CARD_WIDTH : anchor.x + 42);
  const top = Math.max(60, Math.min(layer.height - cardHeight - 96, anchor.y - 40));

  return `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

function pinTargets({ shown, parts, draft }: LayoutState) {
  const keys: string[] = shown.map((a) => a.id);
  const points = shown.map((a) => annotationWorldPosition(a, parts));

  if (draft) {
    keys.push(DRAFT_KEY);
    points.push(draft.position);
  }

  return { keys, points };
}

const anchorKey = ({ draft, activeId }: LayoutState) => (draft ? DRAFT_KEY : activeId);

function placePin(el: HTMLElement | undefined, p: ScreenPoint) {
  if (!el) return;

  el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
  el.style.visibility = p.visible ? 'visible' : 'hidden';
}

export function usePinLayout({
  viewportRef,
  ...state
}: LayoutState & { viewportRef: React.RefObject<Viewport3DHandle | null> }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pinRefs = useRef(new Map<string, HTMLElement>());
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    let raf = 0;

    const layout = (vp: Viewport3DHandle, layer: HTMLDivElement) => {
      const current = stateRef.current;
      const { keys, points } = pinTargets(current);
      const proj = vp.projectPoints(points);
      const anchorAt = keys.indexOf(anchorKey(current) as string);

      keys.forEach((k, i) => placePin(pinRefs.current.get(k), proj[i]));

      const card = cardRef.current;
      const anchor = anchorAt === -1 ? null : proj[anchorAt];

      if (!card || !anchor) return;

      card.style.transform = cardOffset(
        anchor,
        { width: layer.clientWidth, height: layer.clientHeight },
        card.offsetHeight,
      );
      card.style.visibility = 'visible';
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);

      const vp = viewportRef.current;
      const layer = layerRef.current;

      if (vp && layer) layout(vp, layer);
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [viewportRef]);

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
