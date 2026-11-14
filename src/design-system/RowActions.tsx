import React from 'react';

interface RowActionsProps {
  fill: string;
  shown?: boolean;
  className?: string;
  children: React.ReactNode;
}

const REVEAL_OPACITY =
  'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-has-[:focus-visible]:opacity-100 has-aria-expanded:opacity-100';

const REVEAL_CLICKS =
  'pointer-events-none group-hover:pointer-events-auto group-focus-visible:pointer-events-auto group-has-[:focus-visible]:pointer-events-auto has-aria-expanded:pointer-events-auto';

export const REVEAL_ON_HOVER = `${REVEAL_OPACITY} ${REVEAL_CLICKS}`;

export const RowActions: React.FC<RowActionsProps> = ({ fill, shown = false, className = '', children }) => (
  <div
    className={`absolute flex items-center pl-8 pointer-events-none transition-opacity ${shown ? '' : REVEAL_OPACITY} ${className}`}
    style={{ backgroundImage: `linear-gradient(to right, transparent, ${fill} 32px)` }}
  >
    <div className={`contents ${shown ? 'pointer-events-auto' : REVEAL_CLICKS}`}>{children}</div>
  </div>
);
