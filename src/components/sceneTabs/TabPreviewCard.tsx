import React from 'react';
import { createPortal } from 'react-dom';
import { AgentSpinner } from '../../design-system';
import type { SceneTabInfo } from '../SceneTabs';
import { PREVIEW_WIDTH, TabPreviewSpot } from './useTabPreview';

function caption(tab: SceneTabInfo) {
  if (tab.busy) return tab.activity || 'Working';

  if (tab.partCount === 0) return 'No parts';

  return `${tab.partCount} part${tab.partCount === 1 ? '' : 's'}`;
}

export const TabPreviewCard: React.FC<{ tab: SceneTabInfo; spot: TabPreviewSpot; image?: string }> = ({
  tab,
  spot,
  image,
}) =>
  createPortal(
    <div
      role="tooltip"
      className="glass-menu fixed z-[60] rounded-[14px] overflow-hidden pointer-events-none animate-pop-in"
      style={{ left: spot.left, top: spot.top, width: PREVIEW_WIDTH }}
    >
      {image && <img src={image} alt="" className="block w-full aspect-[16/10] object-cover bg-[#1b1b1b]" />}
      <div className="px-3 py-2.5">
        <div className="text-[13px] font-medium text-white/90 truncate">{tab.name || 'Untitled'}</div>
        <div className="text-[12px] text-white/45 tabular mt-0.5 flex items-center gap-1.5 min-w-0">
          {tab.busy && <AgentSpinner />}
          <span className="truncate">{caption(tab)}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
