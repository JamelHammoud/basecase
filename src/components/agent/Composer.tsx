import React, { useLayoutEffect } from 'react';
import { AcpStatusInfo, AgentChoice, ContextUsage, ReferenceImageRecord } from '../../types/robotics';
import { EvidenceFolder, evidenceKind } from '../../utils/evidenceFiles';
import { IconButton, ComposeIcon, CloseIcon, useScrollFade } from '../../design-system';
import { hasPrimaryModifier } from '../../utils/os';
import { AttachMenu } from './AttachMenu';
import { AttachmentTray } from './AttachmentTray';
import { CyclingPlaceholder } from './CyclingPlaceholder';
import { ModelMenu } from './ModelMenu';
import { SendControls } from './SendControls';
import { readyFolders } from './useAttachments';
import { Draft } from './useDraft';
import { OpenImages, SendIntent } from './types';

const EXAMPLES = {
  idle: ['Desk lamp arm', 'Pan–tilt camera mount', 'Gripper for an STS3215', 'Four-wheel rover', 'Hexapod leg'],
  attached: ['Open Duck Mini, 40 cm tall', 'Match the photos', 'Just the head', 'Half scale'],
  busy: ['Longer legs', 'Thicker brackets', 'Round the edges', 'Use M3 screws'],
};

const MAX_PROMPT_PX = 160;
const PROMPT_FADE_PX = 20;

export interface ComposerSubmit {
  text: string;
  images: ReferenceImageRecord[];
  folders: EvidenceFolder[];
}

function exampleSetFor(isBusy: boolean, hasAttachments: boolean): keyof typeof EXAMPLES {
  if (isBusy) return 'busy';

  return hasAttachments ? 'attached' : 'idle';
}

const isSendKey = (e: React.KeyboardEvent) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing;

const EditingBar: React.FC<{ onCancel: () => void }> = ({ onCancel }) => (
  <div className="flex items-center gap-2 pl-4 pr-2 pt-2 animate-fade-in">
    <span className="flex-1 min-w-0 truncate text-[12.5px] text-white/50">Editing queued message</span>
    <IconButton
      icon={<CloseIcon className="w-3.5 h-3.5" />}
      title="Cancel"
      shortcut="Esc"
      tooltipSide="top"
      size="xs"
      className="rounded-full"
      onClick={onCancel}
    />
  </div>
);

export const Composer: React.FC<{
  draft: Draft;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
  attachRequest: number;
  isBusy: boolean;
  agentName: string;
  agent: AcpStatusInfo;
  context: ContextUsage | null;
  choice: AgentChoice;
  onChoiceChange: (choice: AgentChoice) => void;
  onSubmit: (draft: ComposerSubmit, intent: SendIntent) => Promise<void>;
  onStop: () => void;
  onNewChat: () => void;
  onOpenImages: OpenImages;
  above?: React.ReactNode;
}> = ({
  draft,
  promptRef,
  attachRequest,
  isBusy,
  agentName,
  agent,
  context,
  choice,
  onChoiceChange,
  onSubmit,
  onStop,
  onNewChat,
  onOpenImages,
  above,
}) => {
  const { attachments, text: promptText, setText: setPromptText, editing } = draft;
  const hasAttachments = attachments.images.length > 0 || attachments.folders.length > 0;
  const hasDraft = !!promptText.trim() || hasAttachments;
  const canSend = !attachments.isUploading && hasDraft;
  const exampleSet = exampleSetFor(isBusy, hasAttachments);
  const fade = useScrollFade<HTMLTextAreaElement>(PROMPT_FADE_PX);

  useLayoutEffect(() => {
    const el = promptRef.current;

    if (!el) return;

    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, MAX_PROMPT_PX)}px`;
  }, [promptText, promptRef]);

  const submit = async (intent: SendIntent) => {
    if (!canSend) return;

    const text = promptText.trim();
    const images = attachments.images;
    const folders = readyFolders(attachments.folders);

    setPromptText('');
    attachments.clear();
    await onSubmit({ text, images, folders }, intent);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSendKey(e)) {
      e.preventDefault();
      submit(hasPrimaryModifier(e) ? 'queue' : 'default');
    } else if (e.key === 'Escape' && editing) {
      e.preventDefault();
      draft.cancelEdit();
    } else if (e.key === 'Escape' && isBusy && !hasDraft) {
      e.preventDefault();
      onStop();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files).filter((f) => evidenceKind(f));

    if (!files.length) return;

    e.preventDefault();
    attachments.attachFiles(files);
  };

  return (
    <div className="px-3 pb-3 pt-1 shrink-0">
      {above}
      <div className="relative rounded-[20px] bg-[#2a2a2a] ring-1 ring-inset ring-white/[0.08] focus-within:ring-white/[0.16] focus-within:bg-[#2c2c2c] transition-colors">
        {editing && <EditingBar onCancel={draft.cancelEdit} />}

        <AttachmentTray attachments={attachments} onOpenImages={onOpenImages} />

        <div className="relative">
          <textarea
            ref={(node) => {
              promptRef.current = node;
              fade.ref(node);
            }}
            style={fade.style}
            rows={1}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            aria-label={`Message ${agentName}`}
            className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] leading-relaxed text-white/95 outline-none"
          />
          {!promptText && <CyclingPlaceholder key={exampleSet} examples={EXAMPLES[exampleSet]} />}
        </div>

        <div className="flex items-center gap-1 px-2 pb-2">
          <AttachMenu
            attachRequest={attachRequest}
            onAttachFiles={attachments.attachFiles}
            onAttachFolders={attachments.uploadFolders}
          />

          <IconButton
            icon={<ComposeIcon className="w-[18px] h-[18px]" />}
            title="New chat"
            tooltipSide="top"
            size="sm"
            className="rounded-full"
            onClick={onNewChat}
          />

          <div className="flex-1" />

          <ModelMenu agent={agent} context={context} choice={choice} onChange={onChoiceChange} />

          <SendControls
            isBusy={isBusy}
            hasDraft={hasDraft}
            canSend={canSend}
            editing={!!editing}
            onStop={onStop}
            onSend={submit}
          />
        </div>
      </div>
    </div>
  );
};
