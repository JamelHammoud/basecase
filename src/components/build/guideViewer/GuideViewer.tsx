import React from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DRAG_REGION,
  ExternalLinkIcon,
  FloatingIsland,
  FolderOpenIcon,
  IconButton,
  IslandDivider,
  MinusIcon,
  NO_DRAG_REGION,
  PlusIcon,
} from '../../../design-system';
import type { GuidePages } from '../../../guide/viewer/guidePages';
import { useGuideViewer } from './useGuideViewer';

interface GuideViewerProps {
  pages: GuidePages;
  title: string;
  onClosed: () => void;
  onReveal?: () => void;
  onOpenPdf?: () => void;
}

const hidden: React.CSSProperties = { opacity: 0 };

export const GuideViewer: React.FC<GuideViewerProps> = ({ pages, title, onClosed, onReveal, onOpenPdf }) => {
  const viewer = useGuideViewer(pages, onClosed);
  const { scrollerRef, columnRef, backdropRef, chromeRef } = viewer.refs;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${title} build guide`} className="fixed inset-0 z-[95]">
      <div ref={backdropRef} className="absolute inset-0 bg-[#0d0d0d]/[0.94]" style={hidden} />
      <div
        ref={scrollerRef}
        tabIndex={-1}
        className="absolute inset-0 overflow-auto outline-none snap-y snap-proximity"
        style={NO_DRAG_REGION}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || e.target === columnRef.current) viewer.close();
        }}
      >
        <div
          ref={columnRef}
          className="w-max min-w-full flex flex-col items-center gap-[28px] pt-[52px] pb-[76px] px-[48px]"
          style={{ visibility: 'hidden' }}
        />
      </div>
      <div className="absolute inset-x-0 top-0 h-[44px]" style={DRAG_REGION} />
      <div ref={chromeRef} className="absolute inset-0 pointer-events-none" style={hidden}>
        <IconButton
          size="xs"
          title="Close"
          shortcut="Esc"
          tooltipSide="bottom"
          icon={<CloseIcon className="w-4 h-4" />}
          onClick={viewer.close}
          className="absolute top-[8px] right-[20px] pointer-events-auto"
          style={NO_DRAG_REGION}
        />
        <div className="absolute inset-x-0 bottom-[16px] flex justify-center">
          <FloatingIsland className="pointer-events-auto h-[40px]">
            <IconButton
              size="sm"
              title="Previous page"
              shortcut="←"
              tooltipSide="top"
              disabled={viewer.page <= 1}
              icon={<ChevronLeftIcon className="w-4 h-4" />}
              onClick={viewer.previousPage}
            />
            <div className="text-[12.5px] text-white/60 tabular-nums whitespace-nowrap px-[6px] min-w-[64px] text-center">
              {viewer.page} of {viewer.pageCount}
            </div>
            <IconButton
              size="sm"
              title="Next page"
              shortcut="→"
              tooltipSide="top"
              disabled={viewer.page >= viewer.pageCount}
              icon={<ChevronRightIcon className="w-4 h-4" />}
              onClick={viewer.nextPage}
            />
            <IslandDivider />
            <IconButton size="sm" title="Zoom out" shortcut="−" tooltipSide="top" icon={<MinusIcon className="w-4 h-4" />} onClick={viewer.zoomOut} />
            <IconButton size="sm" title="Zoom in" shortcut="+" tooltipSide="top" icon={<PlusIcon className="w-4 h-4" />} onClick={viewer.zoomIn} />
            {(onReveal || onOpenPdf) && <IslandDivider />}
            {onReveal && (
              <IconButton size="sm" title="Show in Finder" tooltipSide="top" icon={<FolderOpenIcon className="w-4 h-4" />} onClick={onReveal} />
            )}
            {onOpenPdf && (
              <IconButton size="sm" title="Open PDF" tooltipSide="top" icon={<ExternalLinkIcon className="w-4 h-4" />} onClick={onOpenPdf} />
            )}
          </FloatingIsland>
        </div>
      </div>
    </div>,
    document.body,
  );
};
