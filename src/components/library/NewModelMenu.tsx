import React, { useRef, useState } from 'react';
import {
  BookmarkAddIcon,
  IconButton,
  MenuDivider,
  MenuItem,
  PopoverMenu,
  FileImportIcon,
  LayersIcon,
  PlusIcon,
} from '../../design-system';

export const NewModelMenu: React.FC<{
  canSaveSelection: boolean;
  canSaveScene: boolean;
  onSaveModel: (mode: 'selected' | 'all') => void;
  onImport: () => void;
}> = ({ canSaveSelection, canSaveScene, onSaveModel, onImport }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="relative" ref={triggerRef}>
      <IconButton
        icon={<PlusIcon className="w-4 h-4" />}
        title="New model"
        size="xs"
        isToggled={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      <PopoverMenu
        isOpen={open}
        onClose={() => setOpen(false)}
        position="bottom"
        align="end"
        ignoreRef={triggerRef}
        className="w-52"
      >
        <MenuItem
          icon={<BookmarkAddIcon className="w-3.5 h-3.5" />}
          label="Save to Library"
          disabled={!canSaveSelection}
          onSelect={run(() => onSaveModel('selected'))}
        />
        <MenuItem
          icon={<LayersIcon className="w-3.5 h-3.5" />}
          label="Save Whole Scene"
          disabled={!canSaveScene}
          onSelect={run(() => onSaveModel('all'))}
        />
        <MenuDivider />
        <MenuItem icon={<FileImportIcon className="w-3.5 h-3.5" />} label="Import" onSelect={run(onImport)} />
      </PopoverMenu>
    </div>
  );
};

