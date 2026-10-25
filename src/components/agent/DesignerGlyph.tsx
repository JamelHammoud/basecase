import React from 'react';
import { ARROW_PATH } from '../../design-system';

export const DesignerGlyph: React.FC<{ color: string; running: boolean }> = ({ color, running }) => (
  <span className="relative w-4 h-4 shrink-0 flex items-center justify-center">
    <svg viewBox="1.5 1.5 19 19" className="relative w-4 h-4 drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.45)]" aria-hidden>
      <path
        d={ARROW_PATH}
        fill={color}
        stroke="white"
        strokeOpacity={running ? 0.95 : 0.55}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);
