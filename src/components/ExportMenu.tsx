import React, { useRef, useState } from 'react';
import {
  Button,
  MenuDivider,
  MenuItem,
  PopoverMenu,
  ClipboardIcon,
  DownloadIcon,
  FileIcon,
  PhotoIcon,
  PrinterIcon,
  RobotsIcon,
  ShareIcon,
} from '../design-system';
import { SHARE_LABEL } from '../utils/os';

interface ExportMenuProps {
  canExportParts: boolean;
  canExportRobot: boolean;
  onExportImage: () => void;
  onExportStl: () => void;
  onExport3mf: () => void;
  onExportScene: () => void;
  onExportRobot: () => void;
  onAirDrop: () => void;
  onCopyMarkdown: () => void;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  canExportParts,
  canExportRobot,
  onExportImage,
  onExportStl,
  onExport3mf,
  onExportScene,
  onExportRobot,
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
        <MenuItem icon={<PhotoIcon className="w-4 h-4" />} label="Image" onSelect={run(onExportImage)} />
        <MenuItem
          icon={<DownloadIcon className="w-4 h-4" />}
          label="STL"
          disabled={!canExportParts}
          onSelect={run(onExportStl)}
        />
        <MenuItem
          icon={<PrinterIcon className="w-4 h-4" />}
          label="3MF Plates"
          disabled={!canExportParts}
          onSelect={run(onExport3mf)}
        />
        <MenuItem icon={<FileIcon className="w-4 h-4" />} label="Scene" onSelect={run(onExportScene)} />
        <MenuItem
          icon={<RobotsIcon className="w-4 h-4" />}
          label="Robot Package"
          disabled={!canExportRobot}
          onSelect={run(onExportRobot)}
        />
        <MenuDivider />
        <MenuItem
          icon={<ClipboardIcon className="w-4 h-4" />}
          label="Copy as Markdown"
          onSelect={run(onCopyMarkdown)}
        />
        <MenuItem
          icon={<ShareIcon className="w-4 h-4" />}
          label={SHARE_LABEL}
          disabled={!canExportParts}
          onSelect={run(onAirDrop)}
        />
      </PopoverMenu>
    </div>
  );
};
