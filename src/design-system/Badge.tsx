import React from 'react';

export type BadgeVariant = 'default' | 'blue' | 'red' | 'green' | 'amber';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-white/[0.07] text-white/55',
  blue: 'bg-[#0d99ff]/15 text-[#5cb8ff]',
  red: 'bg-red-500/15 text-red-400',
  green: 'bg-emerald-500/15 text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-400',
};

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className = '' }) => (
  <span
    className={`inline-flex items-center h-4 px-1.5 rounded-[5px] text-[11px] font-medium tabular leading-none ${badgeVariants[variant]} ${className}`}
  >
    {children}
  </span>
);
