import React, { useRef, useState } from 'react';
import { MenuDivider, MenuItem, MenuLabel, NumberInput, PopoverMenu, Tooltip } from '../../design-system';
import type { BomLine } from '../../utils/bomTypes';
import { MAX_ON_HAND } from '../../utils/purchases';
import type { Extra } from './buyExtras';
import { lineCount } from './buyLine';

interface QtyEditorProps {
  line: BomLine;
  extra?: Extra;
  onQty: (qty: number) => void;
  onOnHand: (count: number) => void;
  onDelete: () => void;
}

const CountField: React.FC<{ label: string; value: number; min: number; onCommit: (v: number) => void }> = ({
  label,
  value,
  min,
  onCommit,
}) => (
  <>
    <MenuLabel>{label}</MenuLabel>
    <div className="px-1 pb-1">
      <NumberInput
        value={value}
        min={min}
        max={MAX_ON_HAND}
        step={1}
        precision={0}
        unit=""
        aria-label={label}
        onChange={(v, live) => !live && onCommit(v)}
      />
    </div>
  </>
);

export const QtyEditor: React.FC<QtyEditorProps> = ({ line, extra, onQty, onOnHand, onDelete }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const pieces = line.unit === 'pcs';

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
        {pieces && extra && <CountField label="Quantity" value={extra.qty} min={1} onCommit={onQty} />}
        {pieces && <CountField label="On Hand" value={line.onHand} min={0} onCommit={onOnHand} />}
        {extra && (
          <>
            {pieces && <MenuDivider />}
            <MenuItem
              label="Delete"
              tone="danger"
              onSelect={() => {
                setOpen(false);
                onDelete();
              }}
            />
          </>
        )}
      </PopoverMenu>
    </div>
  );
};
