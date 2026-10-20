import { useState } from 'react';
import { ColorPickerPopover, Tooltip } from '../design-system';
import { isPresetMarkColor, MARK_COLORS } from '../utils/markColors';

interface MarkColorsProps {
  value: string;
  onChange: (hex: string, live?: boolean) => void;
}

const RAINBOW = 'conic-gradient(#ef4444, #facc15, #22c55e, #3b82f6, #a855f7, #ef4444)';

interface SwatchProps {
  name: string;
  fill: string;
  active: boolean;
  expanded?: boolean;
  onClick: () => void;
}

function Swatch({ name, fill, active, expanded, onClick }: SwatchProps) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={active}
      aria-expanded={expanded}
      onClick={onClick}
      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full cursor-default"
    >
      <span
        className={`w-[18px] h-[18px] rounded-full transition-[box-shadow,transform] duration-150 active:scale-95 ${
          active
            ? 'shadow-[0_0_0_2px_#262626,0_0_0_4px_rgba(255,255,255,0.9)]'
            : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] hover:scale-110'
        }`}
        style={{ background: fill }}
      />
    </button>
  );
}

export function MarkColors({ value, onChange }: MarkColorsProps) {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const custom = !isPresetMarkColor(value);

  return (
    <div className="flex items-center gap-0.5">
      {MARK_COLORS.map((c) => (
        <Tooltip key={c.hex} label={c.name} side="top">
          <Swatch name={c.name} fill={c.hex} active={c.hex === value.toLowerCase()} onClick={() => onChange(c.hex)} />
        </Tooltip>
      ))}
      <div ref={setAnchor}>
        <Tooltip label="Custom color" side="top">
          <Swatch
            name="Custom color"
            fill={custom ? value : RAINBOW}
            active={custom}
            expanded={open}
            onClick={() => setOpen((v) => !v)}
          />
        </Tooltip>
      </div>
      {open && anchor && (
        <ColorPickerPopover
          anchor={anchor}
          side="top"
          value={value}
          suggestions={MARK_COLORS.map((c) => c.hex)}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
