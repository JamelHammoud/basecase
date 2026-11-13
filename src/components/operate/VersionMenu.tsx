import React, { useRef } from 'react';
import { HistoryIcon, IconButton, MenuItem, PopoverMenu } from '../../design-system';
import type { ServoCalibration } from '../../reality/types';

interface VersionMenuProps {
  versions: ServoCalibration[];
  shown: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (version: number) => void;
}

export const VersionMenu: React.FC<VersionMenuProps> = ({ versions, shown, open, onOpenChange, onChoose }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon={<HistoryIcon className="w-4 h-4" />}
        title="Versions"
        size="xs"
        isToggled={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      />
      <PopoverMenu isOpen={open} onClose={() => onOpenChange(false)} ignoreRef={ref} position="bottom" align="end">
        {[...versions].reverse().map((c) => (
          <MenuItem
            key={c.version}
            label={`v${c.version}`}
            checked={c.version === shown}
            onSelect={() => {
              onOpenChange(false);
              onChoose(c.version);
            }}
          />
        ))}
      </PopoverMenu>
    </div>
  );
};
