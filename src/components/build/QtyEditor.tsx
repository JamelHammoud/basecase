import React, { useRef, useState } from 'react';
import { MenuDivider, MenuItem, MenuLabel, NumberInput, PopoverMenu, Tooltip } from '../../design-system';
import type { BomLine } from '../../utils/bomTypes';
import type { Extra } from './buyExtras';
import { lineCount } from './buyLine';

export const QtyEditor: React.FC<{
  line: BomLine;
  extra: Extra;
  onQty: (qty: number) => void;
  onDelete: () => void;
}> = ({ line, extra, onQty, onDelete }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative shrink-0 min-w-[28px] flex justify-end" ref={ref}>
      <Tooltip label="Change quantity">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`-my-[9px] -mx-1 h-[32px] px-1 rounded-md text-[13px] leading-[32px] tabular-nums cursor-default transition-colors duration-150 hover:bg-white/[0.07] hover:text-white/90 ${open ? 'bg-white/[0.07] text-white/90' : 'text-white/50'}`}
        >
          {lineCount(line)}
        </button>
      </Tooltip>
      <PopoverMenu
        isOpen={open}
        onClose={() => setOpen(false)}
        ignoreRef={ref}
        position="bottom"
        align="start"
        className="w-48"
      >
        {line.unit === 'pcs' && (
          <>
            <MenuLabel>Quantity</MenuLabel>
            <div className="px-1 pb-1">
              <NumberInput
                value={extra.qty}
                min={1}
                step={1}
                precision={0}
                unit=""
                aria-label="Quantity"
                onChange={(v, live) => !live && onQty(v)}
              />
            </div>
            <MenuDivider />
          </>
        )}
        <MenuItem
          label="Delete"
          tone="danger"
          onSelect={() => {
            setOpen(false);
            onDelete();
          }}
        />
      </PopoverMenu>
    </div>
  );
};
