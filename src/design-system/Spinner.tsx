import React from 'react';

export const AGENT_WORKING = 'Agent working';

export const Spinner: React.FC<{ className?: string; label?: string }> = ({
  className = 'w-3 h-3 text-white/90',
  label,
}) => (
  <svg
    viewBox="0 0 16 16"
    className={`${className} shrink-0 motion-safe:animate-spin [animation-duration:900ms]`}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.25" />
    <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
  </svg>
);
