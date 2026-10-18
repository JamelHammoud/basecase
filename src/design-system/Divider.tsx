import React from 'react';

/**
 * Hairline that always runs edge to edge. It cancels its container's horizontal padding,
 * which the container publishes as `--pad-x` (menus, Section and Settings do).
 */
export const Divider: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div role="separator" className={`h-px shrink-0 bg-white/[0.08] -mx-[var(--pad-x,0px)] ${className}`} />
);
