import React, { useEffect, useRef, useState } from 'react';
import { FolderPlus, ImagePlus, Plus } from 'lucide-react';
import { foldersFromInput, PickedFolder } from '../../utils/evidenceFiles';
import { IconButton, MenuItem, PopoverMenu } from '../../design-system';

const DIRECTORY_PICKER = { webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>;

const takeFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files ?? []);

  e.target.value = '';

  return files;
};

export const AttachMenu: React.FC<{
  attachRequest: number;
  onAttachFiles: (files: File[]) => Promise<void>;
  onAttachFolders: (folders: PickedFolder[]) => Promise<void>;
}> = ({ attachRequest, onAttachFiles, onAttachFolders }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const lastAttachRequest = useRef(attachRequest);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (attachRequest === lastAttachRequest.current) return;

    lastAttachRequest.current = attachRequest;
    fileInputRef.current?.click();
  }, [attachRequest]);

  const pick = (input: HTMLInputElement | null) => {
    setOpen(false);
    input?.click();
  };

  return (
    <>
      <div className="relative" ref={attachMenuRef}>
        <IconButton
          icon={<Plus className="w-[18px] h-[18px]" />}
          title="Attach"
          tooltipSide="top"
          size="sm"
          className="rounded-full"
          isToggled={open}
          onClick={() => setOpen((v) => !v)}
        />
        <PopoverMenu
          isOpen={open}
          onClose={() => setOpen(false)}
          ignoreRef={attachMenuRef}
          align="start"
          className="w-56"
        >
          <MenuItem
            icon={<ImagePlus className="w-4 h-4" />}
            label="Attach Images…"
            onSelect={() => pick(fileInputRef.current)}
          />
          <MenuItem
            icon={<FolderPlus className="w-4 h-4" />}
            label="Attach Folder…"
            onSelect={() => pick(folderInputRef.current)}
          />
        </PopoverMenu>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={async (e) => {
          await onAttachFiles(takeFiles(e));
        }}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...DIRECTORY_PICKER}
        onChange={async (e) => {
          await onAttachFolders(foldersFromInput(takeFiles(e)));
        }}
        className="hidden"
      />
    </>
  );
};
