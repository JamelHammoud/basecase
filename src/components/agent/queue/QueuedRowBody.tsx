import React from 'react';
import { FolderIcon, GripIcon } from '../../../design-system';
import { QueuedDraft } from '../types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function summaryOf(params: QueuedDraft) {
  const firstLine = params.text.split('\n').find((l) => l.trim());

  if (firstLine) return firstLine;

  const images = params.images?.length ?? 0;

  return images ? plural(images, 'image') : (params.folders?.[0]?.name ?? '');
}

export const QueuedRowBody: React.FC<{ params: QueuedDraft; children?: React.ReactNode }> = ({ params, children }) => {
  const image = params.images?.[0]?.dataUrl;
  const hasFolders = !!params.folders?.length;

  return (
    <>
      <GripIcon className="w-3.5 h-3.5 shrink-0 text-white/30 opacity-0 group-hover/queued:opacity-100 transition-opacity" />
      {image && <img src={image} alt="" draggable={false} className="w-6 h-6 rounded-md object-cover shrink-0" />}
      {!image && hasFolders && <FolderIcon className="w-4 h-4 shrink-0 text-white/50" />}
      <span className="flex-1 min-w-0 truncate text-[13px] text-white/75">{summaryOf(params)}</span>
      {children}
    </>
  );
};
