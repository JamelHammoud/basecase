import React from 'react';

interface RowActionsProps {
  fill: string;
  shown?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const REVEAL_ON_HOVER =
  'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto';

export const RowActions: React.FC<RowActionsProps> = ({ fill, shown = false, className = '', children }) => (
  <div
    className={`absolute flex items-center pl-8 transition-opacity ${shown ? 'opacity-100' : REVEAL_ON_HOVER} ${className}`}
    style={{ backgroundImage: `linear-gradient(to right, transparent, ${fill} 32px)` }}
  >
    {children}
  </div>
);
