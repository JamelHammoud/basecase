import React, { useRef, useState } from 'react';
import {
  Button,
  MenuDivider,
  MenuItem,
  PopoverMenu,
  ClipboardIcon,
  DownloadIcon,
  FileIcon,
  PackageIcon,
  PhotoIcon,
  PrinterIcon,
  RobotsIcon,
  ShareIcon,
} from '../design-system';
import { SHARE_LABEL } from '../utils/os';

interface ExportMenuProps {
  canExportStl: boolean;
  canExportRobot: boolean;
  onExportImage: () => void;
  onExportStl: () => void;
  onExport3mf: () => void;
  onExportStep?: () => void;
  onExportScene: () => void;
  onExportRobot: () => void;
  onAirDrop: () => void;
  onCopyMarkdown: () => void;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  canExportStl,
  canExportRobot,
  onExportImage,
  onExportStl,
  onExport3mf,
  onExportStep,
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
        {onExportStep && (
          <MenuItem
            icon={<PackageIcon className="w-4 h-4" />}
            label="STEP Assembly"
            disabled={!canExportStl}
            onSelect={run(onExportStep)}
          />
        )}
        <MenuItem icon={<FileIcon className="w-4 h-4" />} label="Basecase Scene" onSelect={run(onExportScene)} />
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
          disabled={!canExportStl}
          onSelect={run(onAirDrop)}
        />
      </PopoverMenu>
    </div>
  );
};
