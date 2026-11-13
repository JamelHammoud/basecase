import React from 'react';
import { ChevronDownIcon } from './glyphs';

export interface DisclosureRowProps {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const DisclosureRow: React.FC<DisclosureRowProps> = ({
  open,
  onToggle,
  children,
  disabled,
  className = 'px-[7px]',
}) => (
  <button
    type="button"
    aria-expanded={disabled ? undefined : open}
    disabled={disabled}
    onClick={onToggle}
    className={`w-full flex items-start gap-2 py-1.5 rounded-lg text-left cursor-default enabled:hover:bg-white/[0.04] ${className}`}
  >
    {children}
    {!disabled && (
      <span className="h-[18px] flex items-center shrink-0">
        <ChevronDownIcon
          className={`w-3.5 h-3.5 text-white/50 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
        />
      </span>
    )}
  </button>
);
