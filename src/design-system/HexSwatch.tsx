import React from 'react';

export const HexSwatch: React.FC<{ color: string }> = ({ color }) => (
  <span
    aria-hidden="true"
    className="inline-block w-[0.8em] h-[0.8em] mr-[0.3em] rounded-[3px] align-[-0.08em] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
    style={{ backgroundColor: color }}
  />
);
