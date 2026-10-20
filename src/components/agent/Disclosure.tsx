import React from 'react';
import { ChevronRightIcon } from '../../design-system';

export const DisclosureChevron: React.FC<{ open: boolean; group: 'thought' | 'tool' }> = ({ open, group }) => (
  <ChevronRightIcon
    className={`shrink-0 -ml-1 w-3.5 h-3.5 opacity-60 transition-[transform,opacity] duration-200 ${
      group === 'thought' ? 'group-hover/thought:opacity-100' : 'group-hover/tool:opacity-100'
    } ${open ? 'rotate-90' : ''}`}
  />
);

const INTERACTIVE = 'a, button, pre, input, textarea';

const closeOnPlainClick = (onClose: () => void) => (e: React.MouseEvent) => {
  const selected = window.getSelection()?.toString() ?? '';

  if (selected.trim() || (e.target as Element).closest(INTERACTIVE)) return;

  onClose();
};

export const DisclosureBody: React.FC<{ open: boolean; onClose?: () => void; children: React.ReactNode }> = ({
  open,
  onClose,
  children,
}) => (
  <div
    className={`grid transition-[grid-template-rows,opacity] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)] ${
      open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
    }`}
    aria-hidden={!open}
    inert={!open}
  >
    <div className="min-h-0 overflow-hidden" onClick={onClose && closeOnPlainClick(onClose)}>
      {children}
    </div>
  </div>
);
