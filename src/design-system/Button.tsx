import React from 'react';
import { Tooltip, TooltipSide } from './Tooltip';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'active'
  | 'accent'
  | 'contrast';

export type ButtonSize = 'xs' | 'sm' | 'md';

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
  /** Tooltip text (rendered as a custom tooltip, not a native title) */
  title?: string;
  shortcut?: string;
  tooltipSide?: TooltipSide;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[#0d99ff] hover:bg-[#2ba5ff] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] disabled:bg-white/[0.06] disabled:text-white/30 disabled:shadow-none',
  accent:
    'bg-[#0d99ff] hover:bg-[#2ba5ff] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] disabled:bg-white/[0.06] disabled:text-white/30',
  contrast:
    'bg-white text-black hover:bg-white/90 disabled:bg-white/[0.08] disabled:text-white/30',
  secondary:
    'bg-white/[0.07] hover:bg-white/[0.11] text-white/90 disabled:opacity-40',
  ghost:
    'text-white/60 hover:text-white/90 hover:bg-white/[0.06] disabled:opacity-30',
  danger:
    'bg-red-500/[0.12] text-red-400 hover:bg-red-500/[0.2] hover:text-red-300 disabled:opacity-30',
  active: 'bg-[#0d99ff] text-white hover:bg-[#2ba5ff]',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-[12.5px] rounded-md gap-1',
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  md: 'h-9 px-3.5 text-[14px] rounded-[10px] gap-1.5',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'sm',
  icon,
  iconRight,
  children,
  className = '',
  disabled,
  title,
  shortcut,
  tooltipSide = 'bottom',
  fullWidth = false,
  type = 'button',
  ...props
}) => {
  const button = (
    <button
      type={type}
      disabled={disabled}
      aria-label={!children ? title : undefined}
      className={`inline-flex items-center justify-center font-medium whitespace-nowrap select-none cursor-default transition-[background-color,color,transform,box-shadow] duration-150 active:scale-[0.97] disabled:active:scale-100 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0 inline-flex">{icon}</span>}
      {children && <span className="truncate">{children}</span>}
      {iconRight && <span className="shrink-0 inline-flex">{iconRight}</span>}
    </button>
  );

  if (!title) return button;
  return (
    <Tooltip label={title} shortcut={shortcut} side={tooltipSide} className={fullWidth ? 'w-full' : ''}>
      {button}
    </Tooltip>
  );
};
