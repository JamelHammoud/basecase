import React from 'react';

export const Divider: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div role="separator" className={`h-px shrink-0 bg-white/[0.08] -mx-[var(--pad-x,0px)] ${className}`} />
);
