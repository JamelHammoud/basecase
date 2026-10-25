import React, { useEffect, useRef } from 'react';
import { Button, ChevronLeftIcon, IconButton } from '../../design-system';
import { AcpChatMessage, AcpToolCallEvent } from '../../types/robotics';
import { designerName, designerPartIds, isDesignerRunning } from '../../utils/designers';
import { DesignerGlyph } from './DesignerGlyph';
import { designerSteps } from './designerSummary';
import { useDesigners } from './DesignersContext';
import { usePartSelect } from './PartLinksProvider';
import { SubagentFeed } from './SubagentFeed';
import { OpenImages } from './types';
import { feedMask, useFeedFollow } from './useFeedFollow';

const selectLabel = (count: number) => (count === 1 ? 'Select Part' : `Select ${count} Parts`);

export const SubagentView: React.FC<{ call: AcpToolCallEvent; onClose: () => void; onOpenImages: OpenImages }> = ({
  call,
  onClose,
  onOpenImages,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { colorOf } = useDesigners();
  const parts = usePartSelect();
  const running = isDesignerRunning(call);
  const steps = designerSteps(call);
  const partIds = parts.present(designerPartIds(call));
  const progress = `${call.status}:${call.childThought?.length ?? 0}:${call.childText?.length ?? 0}`;
  const { feedRef, feedContentRef, edgeFade, feedHandlers } = useFeedFollow({ messages: steps, status: progress });
  const mask = feedMask(edgeFade);

  useEffect(() => rootRef.current?.focus({ preventScroll: true }), []);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;

        e.stopPropagation();
        onClose();
      }}
      className="absolute inset-0 z-20 flex flex-col bg-[#1f1f1f] outline-none motion-safe:animate-push-in"
    >
      <header className="h-11 shrink-0 flex items-center gap-2 pl-2 pr-3">
        <IconButton
          size="xs"
          variant="ghost"
          title="Back"
          shortcut="Esc"
          icon={<ChevronLeftIcon className="w-4 h-4" />}
          onClick={onClose}
        />
        <DesignerGlyph color={colorOf(call.toolCallId)} running={running} />
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white/90">{designerName(call)}</h2>
        {!running && partIds.length > 0 && (
          <Button variant="ghost" size="xs" className="shrink-0" onClick={() => parts.select(partIds)}>
            {selectLabel(partIds.length)}
          </Button>
        )}
      </header>
      <div
        ref={feedRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-2 pb-4"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        {...feedHandlers}
      >
        <SubagentFeed
          call={call}
          steps={steps}
          running={running}
          contentRef={feedContentRef}
          onOpenImages={onOpenImages}
        />
      </div>
    </div>
  );
};

export const OpenedSubagent: React.FC<{ messages: AcpChatMessage[]; onOpenImages: OpenImages }> = ({
  messages,
  onOpenImages,
}) => {
  const { opened, open } = useDesigners();
  const call = opened ? messages.flatMap((m) => m.toolCalls ?? []).find((c) => c.toolCallId === opened) : undefined;

  if (!call) return null;

  return <SubagentView key={call.toolCallId} call={call} onClose={() => open(null)} onOpenImages={onOpenImages} />;
};
