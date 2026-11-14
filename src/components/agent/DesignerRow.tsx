import React from 'react';
import { ChevronRightIcon } from '../../design-system';
import { AcpToolCallEvent } from '../../types/robotics';
import { designerName, designerPartIds, isDesignerRunning } from '../../utils/designers';
import { DesignerGlyph } from './DesignerGlyph';
import { designerDetail, designerSteps, type DesignerDetail } from './designerSummary';
import { useDesigners } from './DesignersContext';
import { SHIMMER_TEXT } from './shimmer';
import { useElapsed } from './useElapsed';

const DETAIL_TONE: Record<DesignerDetail['tone'], string> = {
  live: SHIMMER_TEXT,
  quiet: 'text-white/50',
  failed: 'text-red-400',
};

export const DesignerRow: React.FC<{ call: AcpToolCallEvent }> = ({ call }) => {
  const designers = useDesigners();
  const color = designers.colorOf(call.toolCallId);
  const running = isDesignerRunning(call);
  const detail = designerDetail(call, designerSteps(call));
  const elapsed = useElapsed(call.childAt, running);
  const focus = () => designers.focus({ callId: call.toolCallId, color, partIds: designerPartIds(call) });

  return (
    <li className="min-w-0" onMouseEnter={focus} onMouseLeave={() => designers.focus(null)}>
      <button
        type="button"
        onClick={() => designers.open(call.toolCallId)}
        className="group w-full h-[32px] px-2 flex items-center gap-2.5 rounded-lg text-left text-[13px] cursor-default transition-colors duration-150 hover:bg-white/[0.05]"
      >
        <DesignerGlyph color={color} running={running} />
        <span className={`shrink-0 max-w-[60%] truncate font-medium ${running ? 'text-white/90' : 'text-white/60'}`}>
          {designerName(call)}
        </span>
        <span className={`min-w-0 flex-1 truncate ${DETAIL_TONE[detail.tone]}`}>{detail.text}</span>
        {elapsed && <span className="shrink-0 text-[12px] text-white/50 tabular-nums">{elapsed}</span>}
        <ChevronRightIcon className="shrink-0 w-3.5 h-3.5 text-white/30 transition-[color,transform] duration-150 group-hover:text-white/60 group-hover:translate-x-0.5" />
      </button>
    </li>
  );
};
