import React from 'react';
import { SIMREADY_DRAG_TYPE } from '../../data/dnd';
import { ArrowUpRightIcon, HoverCard, PreviewImage } from '../../design-system';
import type { SimReadyAsset } from '../../simready/search';
import { weight } from '../../utils/weight';
import { Header, LinkButton, SizeLine, Stat } from '../PartDetails';

export const dragAsset = (a: SimReadyAsset) =>
  JSON.stringify({ url: a.url, name: a.name, maker: a.maker, license: a.license });

const Details: React.FC<{ asset: SimReadyAsset }> = ({ asset }) => (
  <div>
    <div className="preview aspect-[4/3] m-2 mb-0 flex items-center justify-center rounded-[14px]">
      <PreviewImage src={asset.thumbnail} lazy />
    </div>
    <Header title={asset.name} subtitle={[asset.maker, asset.license].filter(Boolean)} description={asset.caption} />
    <div className="px-4 mt-3 grid grid-cols-2 gap-1.5">
      {asset.sizeMm && (
        <Stat label="Size" wide>
          <SizeLine w={asset.sizeMm[0]} h={asset.sizeMm[1]} d={asset.sizeMm[2]} />
        </Stat>
      )}
      {asset.massKg !== null && <Stat label="Weight">{weight(asset.massKg * 1000)}</Stat>}
      {asset.bodies !== null && asset.bodies > 1 && <Stat label="Moving parts">{asset.bodies}</Stat>}
    </div>
    <div className="mt-3 border-t border-white/[0.07] p-3 [&>a]:w-full">
      <LinkButton href={asset.url} icon={<ArrowUpRightIcon className="w-3.5 h-3.5" />}>
        Open on Hugging Face
      </LinkButton>
    </div>
  </div>
);

export const SimReadyTile: React.FC<{
  asset: SimReadyAsset;
  disabled: boolean;
  onInsert: () => void;
}> = ({ asset, disabled, onInsert }) => (
  <HoverCard content={() => <Details asset={asset} />} beside="aside" className="w-full">
    <button
      type="button"
      disabled={disabled}
      onClick={onInsert}
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(SIMREADY_DRAG_TYPE, dragAsset(asset));
        e.dataTransfer.effectAllowed = 'copy';

        const img = e.currentTarget.querySelector('img');

        if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
      }}
      className="group w-full text-left cursor-default active:scale-[0.98] transition-transform duration-150"
    >
      <div className="preview aspect-[4/3] flex items-center justify-center">
        <PreviewImage src={asset.thumbnail} lazy zoom />
      </div>
      <div className="px-0.5 pt-2">
        <div className="text-[13px] font-medium text-white/90 truncate">{asset.name}</div>
        <div className="text-[12px] text-white/50 truncate">{asset.maker}</div>
      </div>
    </button>
  </HoverCard>
);

const SKELETON_WIDTHS = [
  ['72%', '44%'],
  ['56%', '36%'],
  ['64%', '48%'],
];

export const LoadingTiles: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <>
    {Array.from({ length: count }, (_, i) => {
      const [title, subtitle] = SKELETON_WIDTHS[i % SKELETON_WIDTHS.length];

      return (
        <div key={i} className="w-full" aria-hidden>
          <div className="preview aspect-[4/3]">
            <div className="absolute inset-0 shimmer" />
          </div>
          <div className="px-0.5 pt-2">
            <div className="h-[18.2px] flex items-center">
              <div className="skeleton-line shimmer h-[9px]" style={{ width: title }} />
            </div>
            <div className="h-[16.8px] flex items-center">
              <div className="skeleton-line shimmer h-[7px]" style={{ width: subtitle }} />
            </div>
          </div>
        </div>
      );
    })}
  </>
);
