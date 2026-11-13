import { useEffect, useEffectEvent, useRef } from 'react';
import type { ShortcutId } from '../app/shortcuts';
import { isTextEntry, withFlag } from './helpers';
import { PARTS_CLIPBOARD_TYPE, copyToClipboard, takePaste } from './partsClipboard';
import type { SelectionOps } from './useSelectionOps';
import type { WorkspaceCore } from './useWorkspaceCore';

interface ClipboardOptions {
  core: WorkspaceCore;
  ops: SelectionOps;
  active: boolean;
  blocked: boolean;
  addImagePlane: (file: Blob, name?: string) => Promise<void>;
}

export const CLIPBOARD_EVENTS = ['copy', 'cut', 'paste'] as const satisfies ShortcutId[];

type ClipboardShortcut = (typeof CLIPBOARD_EVENTS)[number];

const hasTextSelection = () => (window.getSelection()?.toString() ?? '') !== '';

const pastedImage = (data: DataTransfer | null) =>
  Array.from(data?.items ?? [])
    .find((i) => i.type.startsWith('image/'))
    ?.getAsFile();

export function useClipboard({ core, ops, active, blocked, addImagePlane }: ClipboardOptions) {
  const { workspaceId, selection, docs, setSelectedIds } = core;
  const forceCopyRef = useRef(false);

  const copySelected = (cut = false) => {
    if (selection.selectedParts.length === 0) return false;

    copyToClipboard(selection.selectedParts, workspaceId, cut);

    if (cut) ops.cutSelected();

    return true;
  };

  const copyViaCommand = (cut: boolean) =>
    withFlag(forceCopyRef, () => {
      if (!document.execCommand(cut ? 'cut' : 'copy')) copySelected(cut);
    });

  const pasteParts = () => {
    const copies = takePaste(workspaceId);

    if (!copies) return;

    docs.commitParts((prev) => [...prev, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  };

  const skip = () => isTextEntry(document.activeElement) || blocked;

  const onCopy = useEffectEvent((e: ClipboardEvent) => {
    if (!forceCopyRef.current && (skip() || hasTextSelection())) return;

    if (!copySelected(e.type === 'cut')) return;

    e.preventDefault();
    e.clipboardData?.setData(PARTS_CLIPBOARD_TYPE, '1');
  });

  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    if (skip()) return;

    if (e.clipboardData?.types.includes(PARTS_CLIPBOARD_TYPE)) {
      e.preventDefault();
      pasteParts();

      return;
    }

    const file = pastedImage(e.clipboardData);

    if (!file) return;

    e.preventDefault();
    void addImagePlane(file, 'Pasted Image');
  });

  useEffect(() => {
    if (!active) return;

    const listeners: Record<ClipboardShortcut, (e: ClipboardEvent) => void> = {
      copy: (e) => onCopy(e),
      cut: (e) => onCopy(e),
      paste: (e) => onPaste(e),
    };

    for (const name of CLIPBOARD_EVENTS) window.addEventListener(name, listeners[name]);

    return () => {
      for (const name of CLIPBOARD_EVENTS) window.removeEventListener(name, listeners[name]);
    };
  }, [active]);

  return { copyViaCommand, pasteParts };
}
