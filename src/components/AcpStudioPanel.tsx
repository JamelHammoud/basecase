import React, { useRef, useState } from 'react';
import {
  AcpChatMessage,
  AcpStatusInfo,
  AgentChoice,
  ContextUsage,
  MessageQuote,
  ReferenceImageRecord,
} from '../types/robotics';
import { AnalyzedImageFeatures } from '../utils/imageTo3DAnalyzer';
import { ImageViewer, ImageViewerItem, Tooltip, ChevronDownIcon, PhotoIcon } from '../design-system';
import { agentKindOf, agentProfileOf } from '../agent/agentKinds';
import { Composer } from './agent/Composer';
import { ConnectionBanner } from './agent/ConnectionBanner';
import { OpenedSubagent } from './agent/SubagentView';
import { Transcript } from './agent/Transcript';
import { QueuedMessages } from './agent/queue/QueuedMessages';
import { QueueControls, SendToAgent } from './agent/types';
import { useDraft } from './agent/useDraft';
import type { ComposeRequest } from './agent/useComposeRequest';
import { useFileDrop } from './agent/useFileDrop';
import { useSubmit } from './agent/useSubmit';
import { feedMask, useFeedFollow } from './agent/useFeedFollow';

interface AcpStudioPanelProps {
  acpStatus: AcpStatusInfo;
  messages: AcpChatMessage[];
  isBusy: boolean;
  status: string;
  context: ContextUsage | null;
  canRevert: boolean;
  attachRequest?: number;
  sketchRequest?: number;
  quote: { request: MessageQuote | null; onRequest: (quote: MessageQuote) => void; onDone: () => void };
  compose?: ComposeRequest;
  targetHeightMm?: number;
  choice: AgentChoice;
  onChoiceChange: (choice: AgentChoice) => void;
  onReconnectAcp: (command?: string) => Promise<void>;
  onSignIn: (methodId: string) => Promise<void>;
  onSaveApiKey: (key: string) => Promise<void>;
  onUploadImage: (file: File) => Promise<{ record: ReferenceImageRecord; features: AnalyzedImageFeatures }>;
  queue: QueueControls;
  onSend: SendToAgent;
  onRetry: (options: { targetHeightMm?: number; model?: string; effort?: string }) => Promise<void>;
  onStop: () => void;
  onNewChat: () => void;
  onRevert: () => void;
}

type ViewerState = { images: ImageViewerItem[]; index: number } | null;

const JumpToBottom: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 animate-pop-up">
    <Tooltip label="Scroll to bottom" side="top">
      <button
        type="button"
        aria-label="Scroll to bottom"
        onClick={onClick}
        className="w-[28px] h-[28px] rounded-full glass text-white/80 hover:text-white hover:bg-[#2e2e2e] flex items-center justify-center cursor-default transition-[transform,background-color] duration-150 active:scale-[0.94]"
      >
        <ChevronDownIcon className="w-4 h-4 translate-y-[1px]" />
      </button>
    </Tooltip>
  </div>
);

const DropOverlay: React.FC = () => (
  <div className="absolute inset-2 rounded-2xl border-2 border-dashed border-[#0d99ff]/70 bg-[#0d99ff]/[0.06] flex flex-col items-center justify-center gap-2 pointer-events-none animate-fade-in">
    <PhotoIcon className="w-6 h-6 text-[#5cb8ff]" />
    <span className="text-[14px] text-white/80">Drop images, files or folders to attach</span>
  </div>
);

export const AcpStudioPanel: React.FC<AcpStudioPanelProps> = ({
  acpStatus,
  messages,
  isBusy,
  status,
  context,
  canRevert,
  attachRequest = 0,
  sketchRequest = 0,
  quote,
  compose,
  targetHeightMm = 0,
  choice,
  onChoiceChange,
  onReconnectAcp,
  onSignIn,
  onSaveApiKey,
  onUploadImage,
  queue,
  onSend,
  onRetry,
  onStop,
  onNewChat,
  onRevert,
}) => {
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const draft = useDraft({ onUploadImage, promptRef, queue, quote, compose });
  const { isDragOver, dropHandlers } = useFileDrop(draft.attachments.attachFiles);
  const [viewer, setViewer] = useState<ViewerState>(null);
  const { feedRef, feedContentRef, edgeFade, showJump, scrollToBottom, feedHandlers } = useFeedFollow({
    messages,
    status,
  });
  const agentName = agentProfileOf(agentKindOf(acpStatus))?.name ?? 'the agent';
  const mask = feedMask(edgeFade);

  const openImages = (images: ImageViewerItem[], index: number) => setViewer({ images, index });

  const { submit, sendNow } = useSubmit({
    draft,
    queue,
    isBusy,
    onSend,
    extras: { targetHeightMm, choice },
    scrollToBottom,
  });

  const retry = async () => {
    scrollToBottom();
    await onRetry({ targetHeightMm: targetHeightMm || undefined, ...choice });
  };

  return (
    <div className="relative flex flex-col h-full min-h-0 min-w-0" {...dropHandlers}>
      <ConnectionBanner
        acpStatus={acpStatus}
        onReconnect={onReconnectAcp}
        onSignIn={onSignIn}
        onSaveApiKey={onSaveApiKey}
      />

      <div className="relative flex-1 min-h-0">
        <div
          ref={feedRef}
          className="h-full overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4"
          style={{ maskImage: mask, WebkitMaskImage: mask }}
          {...feedHandlers}
        >
          <Transcript
            messages={messages}
            isBusy={isBusy}
            status={status}
            canRevert={canRevert}
            contentRef={feedContentRef}
            onContinue={() => sendNow({ text: 'Continue', images: [], folders: [] })}
            onRetry={retry}
            onRevert={onRevert}
            onOpenImages={openImages}
            onQuote={quote.onRequest}
          />
        </div>

        {showJump && <JumpToBottom onClick={() => scrollToBottom(true)} />}
      </div>

      <Composer
        draft={draft}
        promptRef={promptRef}
        attachRequest={attachRequest}
        sketchRequest={sketchRequest}
        isBusy={isBusy}
        agentName={agentName}
        agent={acpStatus}
        context={context}
        choice={choice}
        onChoiceChange={onChoiceChange}
        onSubmit={submit}
        onStop={onStop}
        onNewChat={onNewChat}
        onOpenImages={openImages}
        above={<QueuedMessages queue={queue} onEdit={draft.edit} />}
      />

      {isDragOver && <DropOverlay />}

      <OpenedSubagent messages={messages} onOpenImages={openImages} />

      <ImageViewer
        images={viewer?.images ?? []}
        index={viewer?.index ?? null}
        onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))}
        onClose={() => setViewer(null)}
      />
    </div>
  );
};
