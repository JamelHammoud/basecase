export const tileChip = 'rounded-md bg-black/65 px-1.5 h-6 leading-6 text-[12px]';

export const tileLabel = `pointer-events-none absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] truncate font-medium text-white/90 ${tileChip}`;

const tileWidth = (fill: boolean | undefined, large: boolean) => {
  if (fill) return 'w-full';

  return large ? 'w-[384px]' : 'w-[192px]';
};

export const tileFrame = (fill: boolean | undefined, large: boolean) =>
  `group/tile relative overflow-hidden rounded-[10px] bg-[#1a1a1a] ${
    fill ? '' : 'shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
  } ${tileWidth(fill, large)} aspect-[4/3]`;
