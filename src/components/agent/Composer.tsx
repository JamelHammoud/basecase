import React, { useLayoutEffect, useState } from 'react';
import { SquarePen } from 'lucide-react';
import { ReferenceImageRecord } from '../../types/robotics';
import { EvidenceFolder, evidenceKind } from '../../utils/evidenceFiles';
import { IconButton } from '../../design-system';
import { AttachMenu } from './AttachMenu';
import { AttachmentTray } from './AttachmentTray';
import { CyclingPlaceholder } from './CyclingPlaceholder';
import { SendControls } from './SendControls';
import { Attachments, readyFolders } from './useAttachments';
import { OpenImages } from './types';

const EXAMPLES = {
  idle: ['Desk lamp arm', 'Pan–tilt camera mount', 'Gripper for an STS3215', 'Four-wheel rover', 'Hexapod leg'],
  attached: ['Open Duck Mini, 40 cm tall', 'Match the photos', 'Just the head', 'Half scale'],
  busy: ['Longer legs', 'Thicker brackets', 'Round the edges', 'Use M3 screws'],
};

const MAX_PROMPT_PX = 160;

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

export const Composer: React.FC<{
  attachments: Attachments;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
  attachRequest: number;
  isBusy: boolean;
  isClaude: boolean;
  onSubmit: (draft: ComposerSubmit) => Promise<void>;
  onStop: () => void;
  onNewChat: () => void;
  onOpenImages: OpenImages;
}> = ({ attachments, promptRef, attachRequest, isBusy, isClaude, onSubmit, onStop, onNewChat, onOpenImages }) => {
  const [promptText, setPromptText] = useState('');
  const hasAttachments = attachments.images.length > 0 || attachments.folders.length > 0;
  const hasDraft = !!promptText.trim() || hasAttachments;
  const canSend = !attachments.isUploading && hasDraft;
  const exampleSet = exampleSetFor(isBusy, hasAttachments);

  useLayoutEffect(() => {
    const el = promptRef.current;

    if (!el) return;

    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, MAX_PROMPT_PX)}px`;
  }, [promptText, promptRef]);

  const submit = async () => {
    if (!canSend) return;

    const text = promptText.trim();
    const images = attachments.images;
    const folders = readyFolders(attachments.folders);

    setPromptText('');
    attachments.clear();
    await onSubmit({ text, images, folders });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSendKey(e)) {
      e.preventDefault();
      submit();
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
      <div className="rounded-[20px] bg-white/[0.05] ring-1 ring-inset ring-white/[0.08] focus-within:ring-white/[0.16] focus-within:bg-white/[0.06] transition-colors">
        <AttachmentTray attachments={attachments} onOpenImages={onOpenImages} />

        <div className="relative">
          <textarea
            ref={promptRef}
            rows={1}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            aria-label={`Message ${isClaude ? 'Claude' : 'the agent'}`}
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
            icon={<SquarePen className="w-4 h-4" />}
            title="New chat"
            tooltipSide="top"
            size="sm"
            className="rounded-full"
            disabled={isBusy}
            onClick={onNewChat}
          />

          <div className="flex-1" />

          <SendControls isBusy={isBusy} hasDraft={hasDraft} canSend={canSend} onStop={onStop} onSend={submit} />
        </div>
      </div>
    </div>
  );
};
