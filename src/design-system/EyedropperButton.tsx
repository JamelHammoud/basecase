import React from 'react';
import { Pipette } from 'lucide-react';
import { IconButton } from './IconButton';
import { normalizeHex } from './colorMath';

type EyeDropperWindow = { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } };

export const EyedropperButton: React.FC<{ onPick: (hex: string) => void }> = ({ onPick }) => (
  <IconButton
    icon={<Pipette className="w-4 h-4" />}
    title="Pick color from screen"
    tooltipSide="top"
    onClick={async () => {
      try {
        const dropper = new (window as unknown as EyeDropperWindow).EyeDropper();
        const res = await dropper.open();
        const h = normalizeHex(res.sRGBHex);

        if (h) onPick(h);
      } catch {}
    }}
  />
);
