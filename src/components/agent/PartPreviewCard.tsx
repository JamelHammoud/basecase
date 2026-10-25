import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { mountPartPreview, nextPreviewOrder } from '../../three/partPreview';
import { loadPartMeshes } from '../../three/thumbnailRender';
import type { ScenePart } from '../../types/robotics';
import { overallSize } from '../layers/layerRows';
import { Header } from '../PartDetails';

export const PART_PREVIEW_WIDTH = 280;

const previewParts = (parts: ScenePart[]) => parts.filter((p) => p.kind !== 'image_plane');

const stopMenu = (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

const titleOf = (parts: ScenePart[]) => {
  const group = parts[0]?.group;

  if (parts.length === 1) return parts[0].name;

  if (group && parts.every((p) => p.group?.id === group.id)) return group.name;

  return `${parts.length} parts`;
};

function usePreviewCanvas(shown: ScenePart[], panScroll: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const isPanScroll = useEffectEvent(() => panScroll);

  useEffect(() => {
    const order = nextPreviewOrder();
    let unmount: (() => void) | undefined;
    let cancelled = false;

    loadPartMeshes(shown)
      .then(() => {
        if (cancelled || !ref.current || !shown.length) return;

        unmount = mountPartPreview(ref.current, shown, { panScroll: isPanScroll, order });
        setReady(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unmount?.();
    };
  }, [shown]);

  return { ref, ready };
}

export const PartPreviewCard: React.FC<{ parts: ScenePart[]; panScroll: boolean }> = ({ parts, panScroll }) => {
  const [shown] = useState(() => previewParts(parts));
  const { ref, ready } = usePreviewCanvas(shown, panScroll);
  const size = overallSize(shown);

  return (
    <div className="pb-3">
      <div className="relative h-[180px] bg-[radial-gradient(ellipse_at_50%_45%,rgba(255,255,255,0.13),rgba(255,255,255,0.02)_60%,transparent_100%)]">
        {!ready && <div className="absolute inset-0 shimmer" />}
        <div
          ref={ref}
          onContextMenu={stopMenu}
          className={`absolute inset-0 cursor-grab active:cursor-grabbing ${ready ? 'animate-fade-in' : ''}`}
        />
      </div>
      <Header title={titleOf(shown)} subtitle={size ? `${size} mm` : ''} />
    </div>
  );
};
