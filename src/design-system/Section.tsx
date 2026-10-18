import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { IconButton } from './IconButton';

export interface SectionProps {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export const Section: React.FC<SectionProps> = ({
  title,
  actions,
  children,
  collapsible = false,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className = '',
}) => {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = (next: (v: boolean) => boolean) => {
    const v = next(open);

    if (openProp === undefined) setOpenState(v);

    onOpenChange?.(v);
  };
  const isOpen = !collapsible || open;
  const showBody = isOpen && React.Children.toArray(children).length > 0;

  return (
    <section className={`px-[12px] [--pad-x:12px] py-4 border-b border-white/[0.06] last:border-b-0 ${className}`}>
      <header className={`flex items-center justify-between h-7 ${showBody ? '-mt-1 mb-2' : '-my-1'}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex-1 min-w-0 h-7 flex items-center text-left text-[13px] font-semibold text-white/90 select-none cursor-default"
            aria-expanded={isOpen}
          >
            {title}
          </button>
        ) : (
          <h3 className="text-[13px] font-semibold text-white/90 select-none">{title}</h3>
        )}
        {(actions || collapsible) && (
          <div className="flex items-center gap-0.5 -mr-1">
            {actions}
            {collapsible && (
              <IconButton
                icon={
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${isOpen ? 'rotate-180' : ''}`}
                  />
                }
                title={isOpen ? 'Collapse' : 'Expand'}
                size="xs"
                tabIndex={-1}
                aria-hidden
                onClick={() => setOpen((v) => !v)}
              />
            )}
          </div>
        )}
      </header>
      {showBody && <div className="space-y-2.5">{children}</div>}
    </section>
  );
};
