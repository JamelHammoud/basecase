import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './IconButton';
import type { ImageViewerItem } from './ImageViewer';

interface ImageViewerNavProps {
  images: ImageViewerItem[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onStep: (dir: 1 | -1) => void;
}

export const ImageViewerNav: React.FC<ImageViewerNavProps> = ({ images, index, onIndexChange, onStep }) => (
  <>
    <div className="absolute left-3 top-1/2 -translate-y-1/2 glass rounded-full p-1">
      <IconButton
        icon={<ChevronLeft className="w-5 h-5" />}
        title="Previous"
        shortcut="←"
        size="md"
        tooltipSide="right"
        className="rounded-full"
        onClick={() => onStep(-1)}
      />
    </div>
    <div className="absolute right-3 top-1/2 -translate-y-1/2 glass rounded-full p-1">
      <IconButton
        icon={<ChevronRight className="w-5 h-5" />}
        title="Next"
        shortcut="→"
        size="md"
        tooltipSide="left"
        className="rounded-full"
        onClick={() => onStep(1)}
      />
    </div>
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[calc(100%-32px)] glass rounded-[16px] p-1.5 flex gap-1.5 overflow-x-auto no-scrollbar">
      {images.map((img, i) => (
        <button
          key={i}
          type="button"
          aria-label={img.name || `Image ${i + 1}`}
          onClick={() => onIndexChange(i)}
          className={`w-11 h-11 shrink-0 rounded-[9px] overflow-hidden cursor-default transition-[opacity,box-shadow] duration-150 ${
            i === index ? 'ring-2 ring-[#0d99ff]' : 'opacity-55 hover:opacity-100'
          }`}
        >
          <img src={img.src} alt="" draggable={false} className="w-full h-full object-cover" />
        </button>
      ))}
    </div>
  </>
);
