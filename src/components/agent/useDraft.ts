import React, { useState } from 'react';
import { MessageQuote, ReferenceImageRecord } from '../../types/robotics';
import { AnalyzedImageFeatures } from '../../utils/imageTo3DAnalyzer';
import { FolderChip, folderChip, useAttachments } from './useAttachments';
import { QueueControls, QueuedDraft, QueueSlotRef } from './types';
import { useComposeRequest, type ComposeRequest } from './useComposeRequest';
import { useQuoteRequest } from './useQuoteRequest';
import { focusPromptSoon } from './focusPromptSoon';

interface Stash {
  text: string;
  images: ReferenceImageRecord[];
  folders: FolderChip[];
  quotes: MessageQuote[];
}

interface Editing {
  slot: QueueSlotRef;
  stash: Stash;
}

interface DraftOptions {
  onUploadImage: (file: File) => Promise<{ record: ReferenceImageRecord; features: AnalyzedImageFeatures }>;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
  queue: QueueControls;
  quote?: { request: MessageQuote | null; onDone: () => void };
  compose?: ComposeRequest;
}

const stashOf = (params: QueuedDraft): Stash => ({
  text: params.text,
  images: params.images ?? [],
  folders: (params.folders ?? []).map(folderChip),
  quotes: params.quotes ?? [],
});

export function useDraft({ onUploadImage, promptRef, queue, quote, compose }: DraftOptions) {
  const attachments = useAttachments({ onUploadImage, promptRef });
  const [text, setText] = useState('');
  const [quotes, setQuotes] = useState<MessageQuote[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const removeQuote = (id: string) => setQuotes((all) => all.filter((q) => q.id !== id));
  const addQuote = (next: MessageQuote) => setQuotes((all) => [...all.filter((q) => q.id !== next.id), next]);

  useQuoteRequest(quote?.request ?? null, { addQuote, promptRef, onQuoted: quote?.onDone });
  useComposeRequest(compose, { setText, promptRef });

  const load = (stash: Stash) => {
    setText(stash.text);
    setQuotes(stash.quotes);
    attachments.restore(stash.images, stash.folders);
  };

  const edit = (itemId: string) => {
    if (editing) queue.put(editing.slot, editing.slot.item.params);

    const slot = queue.take(itemId);

    if (!slot) return;

    setEditing({
      slot,
      stash: editing?.stash ?? { text, quotes, images: attachments.images, folders: attachments.folders },
    });
    load(stashOf(slot.item.params));
    focusPromptSoon(promptRef, 'end');
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

  return {
    attachments,
    text,
    setText,
    quotes,
    removeQuote,
    clearQuotes: () => setQuotes([]),
    editing: editing?.slot ?? null,
    edit,
    finishEdit,
    cancelEdit,
  };
}

export type Draft = ReturnType<typeof useDraft>;
