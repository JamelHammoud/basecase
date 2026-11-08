import React, { useEffect, useRef, useState } from 'react';
import type { SlashCommand } from '../../agent/slashCommands';
import { foldersFromInput, PickedFolder } from '../../utils/evidenceFiles';
import {
  IconButton,
  MenuDivider,
  MenuItem,
  PopoverMenu,
  FolderAddIcon,
  PenIcon,
  PhotoAddIcon,
  PlusIcon,
  SlashIcon,
} from '../../design-system';
import { CommandsView } from './CommandsView';

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
  onSketch: () => void;
  onCommand: (command: SlashCommand) => void;
}> = ({ attachRequest, onAttachFiles, onAttachFolders, onSketch, onCommand }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const lastAttachRequest = useRef(attachRequest);
  const [open, setOpen] = useState(false);
  const [showCommands, setShowCommands] = useState(false);

  useEffect(() => {
    if (attachRequest === lastAttachRequest.current) return;

    lastAttachRequest.current = attachRequest;
    fileInputRef.current?.click();
  }, [attachRequest]);

  const close = () => {
    setOpen(false);
    setShowCommands(false);
  };

  const pick = (input: HTMLInputElement | null) => {
    close();
    input?.click();
  };

  return (
    <>
      <div className="relative" ref={attachMenuRef}>
        <IconButton
          icon={<PlusIcon className="w-[18px] h-[18px]" />}
          title="Attach"
          tooltipSide="top"
          size="sm"
          className="rounded-bl-[16px]"
          isToggled={open}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        />
        <PopoverMenu
          isOpen={open}
          onClose={close}
          ignoreRef={attachMenuRef}
          align="start"
          className={showCommands ? 'w-80' : 'w-56'}
        >
          {showCommands ? (
            <CommandsView
              onBack={() => setShowCommands(false)}
              onPick={(command) => {
                close();
                onCommand(command);
              }}
            />
          ) : (
            <>
              <MenuItem
                icon={<PhotoAddIcon className="w-4 h-4" />}
                label="Attach Images"
                onSelect={() => pick(fileInputRef.current)}
              />
              <MenuItem
                icon={<FolderAddIcon className="w-4 h-4" />}
                label="Attach Folder"
                onSelect={() => pick(folderInputRef.current)}
              />
              <MenuItem
                icon={<PenIcon className="w-4 h-4" />}
                label="Sketch"
                onSelect={() => {
                  close();
                  onSketch();
                }}
              />
              <MenuDivider />
              <MenuItem
                icon={<SlashIcon className="w-4 h-4" />}
                label="Commands"
                onSelect={() => setShowCommands(true)}
              />
            </>
          )}
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
