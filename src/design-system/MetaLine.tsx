import React from 'react';

export type MetaItem = React.ReactNode;

const present = (item: MetaItem) => item !== undefined && item !== null && item !== false && item !== '';

export const MetaLine: React.FC<{ items: MetaItem[]; className?: string }> = ({ items, className = '' }) => (
  <span className={`flex min-w-0 items-baseline gap-x-[12px] ${className}`}>
    {items.filter(present).map((item, i) => (
      <span key={i} className="min-w-0 truncate [&:not(:last-child)]:shrink-0">
        {item}
      </span>
    ))}
  </span>
);
