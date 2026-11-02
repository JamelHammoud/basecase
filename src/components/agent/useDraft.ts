import React, { useState } from 'react';
import { ReferenceImageRecord } from '../../types/robotics';
import { AnalyzedImageFeatures } from '../../utils/imageTo3DAnalyzer';
import { FolderChip, folderChip, useAttachments } from './useAttachments';
import { QueueControls, QueuedDraft, QueueSlotRef } from './types';

interface Stash {
  text: string;
  images: ReferenceImageRecord[];
  folders: FolderChip[];
}

interface Editing {
  slot: QueueSlotRef;
  stash: Stash;
}

interface DraftOptions {
  onUploadImage: (file: File) => Promise<{ record: ReferenceImageRecord; features: AnalyzedImageFeatures }>;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
  queue: QueueControls;
}

const stashOf = (params: QueuedDraft): Stash => ({
  text: params.text,
  images: params.images ?? [],
  folders: (params.folders ?? []).map(folderChip),
});

export function useDraft({ onUploadImage, promptRef, queue }: DraftOptions) {
  const attachments = useAttachments({ onUploadImage, promptRef });
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);

  const load = (stash: Stash) => {
    setText(stash.text);
    attachments.restore(stash.images, stash.folders);
  };

  const edit = (itemId: string) => {
    if (editing) queue.put(editing.slot, editing.slot.item.params);

    const slot = queue.take(itemId);

    if (!slot) return;

    setEditing({ slot, stash: editing?.stash ?? { text, images: attachments.images, folders: attachments.folders } });
    load(stashOf(slot.item.params));
    requestAnimationFrame(() => {
      const el = promptRef.current;

      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const finishEdit = () => {
    if (!editing) return;

    load(editing.stash);
    setEditing(null);
  };

  const cancelEdit = () => {
    if (!editing) return;

    queue.put(editing.slot, editing.slot.item.params);
    finishEdit();
  };

  return { attachments, text, setText, editing: editing?.slot ?? null, edit, finishEdit, cancelEdit };
}

export type Draft = ReturnType<typeof useDraft>;
