import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { IconButton } from './IconButton';

export interface SectionProps {
  title: string;
  /** Icon buttons on the right of the header */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Makes the header a disclosure toggle */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Controlled open state (collapsible sections), with onOpenChange */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * Figma UI3-style inspector section: sentence-case title, hairline divider, no card.
 * Collapsible sections keep the title where a plain one sits and put the chevron at the right.
 */
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
  // An empty or collapsed section is just its header, centered between equal paddings
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
            {/* The title is the toggle for keyboard and screen readers; this mirrors it for the pointer */}
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
