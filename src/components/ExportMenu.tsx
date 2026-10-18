import React, { useRef, useState } from 'react';
import { ClipboardCopy, Download, ImageDown } from 'lucide-react';
import { Button, MenuDivider, MenuItem, PopoverMenu } from '../design-system';

interface ExportMenuProps {
  canExportStl: boolean;
  onExportImage: () => void;
  onExportStl: () => void;
  /** Copies the scene's parts, sizes and comments as Markdown */
  onCopyMarkdown: () => void;
}

/** Top-right Export button. Each instance keeps its own menu, so the docked and floating copies never both open. */
export const ExportMenu: React.FC<ExportMenuProps> = ({
  canExportStl,
  onExportImage,
  onExportStl,
  onCopyMarkdown,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="primary" size="sm" className="px-3.5" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Export
      </Button>
      <PopoverMenu
        isOpen={open}
        onClose={() => setOpen(false)}
        ignoreRef={ref}
        position="bottom"
        align="end"
        className="w-56"
      >
        <MenuItem
          icon={<ImageDown className="w-4 h-4" />}
          label="PNG Image"
          onSelect={run(onExportImage)}
        />
        <MenuItem
          icon={<Download className="w-4 h-4" />}
          label="STL Mesh"
          disabled={!canExportStl}
          onSelect={run(onExportStl)}
        />
        <MenuDivider />
        <MenuItem
          icon={<ClipboardCopy className="w-4 h-4" />}
          label="Copy as Markdown"
          onSelect={run(onCopyMarkdown)}
        />
      </PopoverMenu>
    </div>
  );
};
