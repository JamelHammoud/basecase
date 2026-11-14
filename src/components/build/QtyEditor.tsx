import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { deleteEntry, MenuDivider, MenuItem, MenuLabel, NumberInput, PopoverMenu, Tooltip } from '../../design-system';
import type { BomLine } from '../../utils/bomTypes';
import { MAX_ON_HAND } from '../../utils/onHand';
import type { Extra } from './buyExtras';
import { lineCount } from './buyLine';

const ON_HAND = 'On hand';

interface ExtraControls {
  extra: Extra;
  onQty: (qty: number) => void;
  onDelete: () => void;
}

interface CountFieldProps {
  label: string;
  value: number;
  min: number;
  max?: number;
  unit: string;
  onChange: (v: number) => void;
}

const CountField: React.FC<CountFieldProps> = ({ label, value, min, max, unit, onChange }) => {
  const pending = useRef<number | null>(null);
  const commit = () => {
    const next = pending.current;

    pending.current = null;

    if (next !== null && next !== value) onChange(next);
  };
  const commitOnClose = useEffectEvent(commit);

  useEffect(() => () => commitOnClose(), []);

  return (
    <>
      <MenuLabel>{label}</MenuLabel>
      <div
        className="px-1 pb-1"
        onBlur={commit}
        onKeyDownCapture={(e) => {
          if (e.key === 'Escape') pending.current = null;
        }}
      >
        <NumberInput
          value={value}
          min={min}
          max={max}
          step={1}
          precision={0}
          unit={unit}
          aria-label={label}
          onChange={(v, live) => {
            if (!live) pending.current = v;
          }}
        />
      </div>
    </>
  );
};

export const QtyEditor: React.FC<{
  line: BomLine;
  onHand: number;
  onOnHand: (count: number) => void;
  extra?: ExtraControls;
}> = ({ line, onHand, onOnHand, extra }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const unit = line.unit === 'g' ? 'g' : '';

  return (
    <div className="relative shrink-0 min-w-[28px] flex justify-end" ref={ref}>
      <Tooltip label={extra ? 'Change quantity' : ON_HAND}>
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
        {extra && line.unit === 'pcs' && (
          <CountField label="Quantity" value={extra.extra.qty} min={1} unit="" onChange={extra.onQty} />
        )}
        <CountField label={ON_HAND} value={onHand} min={0} max={MAX_ON_HAND} unit={unit} onChange={onOnHand} />
        {extra && (
          <>
            <MenuDivider />
            <MenuItem
              {...deleteEntry(() => {
                setOpen(false);
                extra.onDelete();
              })}
            />
          </>
        )}
      </PopoverMenu>
    </div>
  );
};
