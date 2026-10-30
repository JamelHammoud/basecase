import React, { useRef, useState } from 'react';
import {
  Button,
  MenuDivider,
  MenuItem,
  PopoverMenu,
  ClipboardIcon,
  DownloadIcon,
  PhotoIcon,
  PrinterIcon,
  ShareIcon,
} from '../design-system';

interface ExportMenuProps {
  canExportStl: boolean;
  onExportImage: () => void;
  onExportStl: () => void;
  onExport3mf: () => void;
  onAirDrop: () => void;
  onCopyMarkdown: () => void;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  canExportStl,
  onExportImage,
  onExportStl,
  onExport3mf,
  onAirDrop,
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
        <MenuItem icon={<PhotoIcon className="w-4 h-4" />} label="PNG Image" onSelect={run(onExportImage)} />
        <MenuItem
          icon={<DownloadIcon className="w-4 h-4" />}
          label="STL Mesh"
          disabled={!canExportStl}
          onSelect={run(onExportStl)}
        />
        <MenuItem
          icon={<PrinterIcon className="w-4 h-4" />}
          label="3MF Plates"
          disabled={!canExportStl}
          onSelect={run(onExport3mf)}
        />
        <MenuDivider />
        <MenuItem
          icon={<ClipboardIcon className="w-4 h-4" />}
          label="Copy as Markdown"
          onSelect={run(onCopyMarkdown)}
        />
        <MenuItem
          icon={<ShareIcon className="w-4 h-4" />}
          label="AirDrop"
          disabled={!canExportStl}
          onSelect={run(onAirDrop)}
        />
      </PopoverMenu>
    </div>
  );
};
