import { useState } from 'react';
import { ColorPickerPopover } from './ColorPicker';
import { ColorSwatch } from './ColorSwatch';
import { Tooltip } from './Tooltip';

export interface NamedColor {
  name: string;
  hex: string;
}

interface ColorSwatchesProps {
  colors: NamedColor[];
  value: string;
  onChange: (hex: string, live?: boolean) => void;
  onPicked?: () => void;
}

const RAINBOW = 'conic-gradient(#ef4444, #facc15, #22c55e, #3b82f6, #a855f7, #ef4444)';

export function ColorSwatches({ colors, value, onChange, onPicked }: ColorSwatchesProps) {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const custom = !colors.some((c) => c.hex === value.toLowerCase());

  const pickNamed = (hex: string) => {
    onChange(hex);
    onPicked?.();
  };

  const closePicker = () => {
    setOpen(false);
    onPicked?.();
  };

  return (
    <div className="flex items-center gap-0.5">
      {colors.map((c) => (
        <Tooltip key={c.hex} label={c.name} side="top">
          <ColorSwatch
            name={c.name}
            fill={c.hex}
            active={c.hex === value.toLowerCase()}
            onClick={() => pickNamed(c.hex)}
          />
        </Tooltip>
      ))}
      <div ref={setAnchor}>
        <Tooltip label="Custom color" side="top">
          <ColorSwatch
            name="Custom color"
            fill={custom ? value : RAINBOW}
            active={custom}
            expanded={open}
            onClick={() => (open ? closePicker() : setOpen(true))}
          />
        </Tooltip>
      </div>
      {open && anchor && (
        <ColorPickerPopover
          anchor={anchor}
          side="top"
          value={value}
          suggestions={colors.map((c) => c.hex)}
          onChange={onChange}
          onClose={closePicker}
        />
      )}
    </div>
  );
}
