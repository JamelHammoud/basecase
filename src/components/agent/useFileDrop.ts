import { useState, type DragEvent } from 'react';
import { collectDrop } from '../../utils/evidenceFiles';
import type { Draft } from './useDraft';

export function useFileDrop(attachFiles: Draft['attachments']['attachFiles']) {
  const [isDragOver, setIsDragOver] = useState(false);

  return {
    isDragOver,
    dropHandlers: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return;

        e.preventDefault();
        setIsDragOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        collectDrop(e.dataTransfer).then(({ loose, folders }) => attachFiles(loose, folders));
      },
    },
  };
}
