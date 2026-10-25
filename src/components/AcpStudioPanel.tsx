import React, { useRef, useState } from 'react';
import { AcpChatMessage, AcpStatusInfo, AgentChoice, ContextUsage, ReferenceImageRecord } from '../types/robotics';
import { AnalyzedImageFeatures } from '../utils/imageTo3DAnalyzer';
import { collectDrop, EvidenceFolder } from '../utils/evidenceFiles';
import { ImageViewer, ImageViewerItem, Tooltip, ChevronDownIcon, PhotoIcon } from '../design-system';
import { agentKindOf, agentProfileOf } from '../agent/agentKinds';
import { Composer, ComposerSubmit } from './agent/Composer';
import { ConnectionBanner } from './agent/ConnectionBanner';
import { OpenedSubagent } from './agent/SubagentView';
import { Transcript } from './agent/Transcript';
import { useAttachments } from './agent/useAttachments';
import { feedMask, useFeedFollow } from './agent/useFeedFollow';

interface AcpStudioPanelProps {
  acpStatus: AcpStatusInfo;
  messages: AcpChatMessage[];
  isBusy: boolean;
  status: string;
  context: ContextUsage | null;
  canRevert: boolean;
  attachRequest?: number;
  targetHeightMm?: number;
  choice: AgentChoice;
  onChoiceChange: (choice: AgentChoice) => void;
  onReconnectAcp: (command?: string) => Promise<void>;
  onSignIn: (methodId: string) => Promise<void>;
  onSaveApiKey: (key: string) => Promise<void>;
  onUploadImage: (file: File) => Promise<{ record: ReferenceImageRecord; features: AnalyzedImageFeatures }>;
  onSend: (params: {
    text: string;
    images?: ReferenceImageRecord[];
    folders?: EvidenceFolder[];
    targetHeightMm?: number;
    model?: string;
    effort?: string;
  }) => Promise<void>;
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
        className="w-8 h-8 rounded-full bg-[#2a2a2f] ring-1 ring-white/[0.1] shadow-[0_4px_14px_rgba(0,0,0,0.45)] text-white/80 hover:text-white hover:bg-[#323238] flex items-center justify-center cursor-default transition-[transform,background-color] duration-150 active:scale-[0.94]"
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
  targetHeightMm = 0,
  choice,
  onChoiceChange,
  onReconnectAcp,
  onSignIn,
  onSaveApiKey,
  onUploadImage,
  onSend,
  onRetry,
  onStop,
  onNewChat,
  onRevert,
}) => {
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const attachments = useAttachments({ onUploadImage, promptRef });
  const [isDragOver, setIsDragOver] = useState(false);
  const [viewer, setViewer] = useState<ViewerState>(null);
  const { feedRef, feedContentRef, edgeFade, showJump, scrollToBottom, feedHandlers } = useFeedFollow({
    messages,
    status,
  });
  const agentName = agentProfileOf(agentKindOf(acpStatus))?.name ?? 'the agent';
  const mask = feedMask(edgeFade);

  const openImages = (images: ImageViewerItem[], index: number) => setViewer({ images, index });

  const submit = async (draft: ComposerSubmit) => {
    scrollToBottom();
    await onSend({ ...draft, targetHeightMm: targetHeightMm || undefined, ...choice });
  };

  const retry = async () => {
    scrollToBottom();
    await onRetry({ targetHeightMm: targetHeightMm || undefined, ...choice });
  };

  return (
    <div
      className="relative flex flex-col h-full min-h-0 min-w-0"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;

        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        collectDrop(e.dataTransfer).then(({ loose, folders }) => attachments.attachFiles(loose, folders));
      }}
    >
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
            onContinue={() => submit({ text: 'Continue', images: [], folders: [] })}
            onRetry={retry}
            onRevert={onRevert}
            onOpenImages={openImages}
          />
        </div>

        {showJump && <JumpToBottom onClick={() => scrollToBottom(true)} />}
      </div>

      <Composer
        attachments={attachments}
        promptRef={promptRef}
        attachRequest={attachRequest}
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
