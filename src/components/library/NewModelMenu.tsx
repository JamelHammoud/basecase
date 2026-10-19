import React, { useRef, useState } from 'react';
import { Box, FileUp, ImagePlus, Layers, Plus } from 'lucide-react';
import { IconButton, MenuDivider, MenuItem, PopoverMenu } from '../../design-system';

export const NewModelMenu: React.FC<{
  canSaveSelection: boolean;
  canSaveScene: boolean;
  onSaveModel: (mode: 'selected' | 'all') => void;
  onImportSvg: () => void;
  onImageToModel: () => void;
}> = ({ canSaveSelection, canSaveScene, onSaveModel, onImportSvg, onImageToModel }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="relative" ref={triggerRef}>
      <IconButton
        icon={<Plus className="w-3.5 h-3.5" />}
        title="New model"
        size="xs"
        isToggled={open}
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
          icon={<Box className="w-3.5 h-3.5" />}
          label="Save Selection"
          disabled={!canSaveSelection}
          onSelect={run(() => onSaveModel('selected'))}
        />
        <MenuItem
          icon={<Layers className="w-3.5 h-3.5" />}
          label="Save Whole Scene"
          disabled={!canSaveScene}
          onSelect={run(() => onSaveModel('all'))}
        />
        <MenuDivider />
        <MenuItem icon={<FileUp className="w-3.5 h-3.5" />} label="Import SVG…" onSelect={run(onImportSvg)} />
        <MenuItem icon={<ImagePlus className="w-3.5 h-3.5" />} label="From Image…" onSelect={run(onImageToModel)} />
      </PopoverMenu>
    </div>
  );
};

