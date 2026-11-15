import React, { useEffect, useRef, useState } from 'react';
import { PreviewImage } from '../../design-system';
import { loadFrameJpeg } from '../../vision/frameSetStore';
import { useSeen } from './useSeen';
import { frozenImageJpeg, type FrozenImageSample } from '../../datasets/snapshotImages';

interface DatasetImageTileProps {
  setId: string;
  frameId: string;
  frozen?: FrozenImageSample;
}

export const DatasetImageTile: React.FC<DatasetImageTileProps> = ({ setId, frameId, frozen }) => {
  const tile = useRef<HTMLDivElement | null>(null);
  const seen = useSeen(tile);
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const key = `${setId}:${frameId}:${frozen?.content ?? ''}`;

  useEffect(() => {
    if (!seen) return;

    let live = true;
    let url: string | null = null;

    const load = frozen ? frozenImageJpeg(frozen) : loadFrameJpeg(setId, frameId);

    load
      .then((jpeg) => {
        if (!live) return;

        url = jpeg ? URL.createObjectURL(new Blob([Uint8Array.from(jpeg)], { type: 'image/jpeg' })) : '';
        setImage({ key, url });
      })
      .catch(() => live && setImage({ key, url: '' }));

    return () => {
      live = false;

      if (url) URL.revokeObjectURL(url);
    };
  }, [setId, frameId, seen, key, frozen]);

  return (
    <div
      ref={tile}
      data-testid="dataset-image-tile"
      data-frame={frameId}
      className="min-w-0 p-1.5 flex flex-col gap-1.5"
    >
      <div className="aspect-[4/3] rounded-[6px] bg-white/[0.04] overflow-hidden">
        <PreviewImage src={image?.key === key ? image.url : undefined} lazy />
      </div>
    </div>
  );
};
