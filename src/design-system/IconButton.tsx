import React from 'react';
import { Tooltip, TooltipSide } from './Tooltip';

export type IconButtonVariant = 'default' | 'active' | 'ghost' | 'danger' | 'primary' | 'toggled';
export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  title: string;
  shortcut?: string;
  tooltipSide?: TooltipSide;
  isActive?: boolean;
  isToggled?: boolean;
}

const variantStyles: Record<IconButtonVariant, string> = {
  default:
    'text-white/60 hover:text-white/95 hover:bg-white/[0.07] active:bg-white/[0.1] disabled:opacity-30 disabled:hover:bg-transparent',
  ghost: 'text-white/45 hover:text-white/90 hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent',
  active: 'bg-[#0d99ff] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
  toggled: 'bg-white/[0.1] text-white',
  danger: 'text-white/50 hover:text-red-400 hover:bg-red-500/[0.12] disabled:opacity-30',
  primary: 'bg-[#0d99ff] hover:bg-[#2ba5ff] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
};

const sizeStyles: Record<IconButtonSize, string> = {
  xs: 'w-7 h-7 rounded-lg',
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-9 h-9 rounded-[10px]',
  lg: 'w-11 h-11 rounded-[14px]',
};

function chosenVariantFor({
  isActive,
  isToggled,
  variant,
}: {
  isActive: boolean;
  isToggled: boolean;
  variant: IconButtonVariant;
}): IconButtonVariant {
  if (isActive) return 'active';

  if (isToggled) return 'toggled';

  return variant;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = 'default',
  size = 'sm',
  title,
  shortcut,
  tooltipSide = 'bottom',
  isActive = false,
  isToggled = false,
  className = '',
  disabled,
  type = 'button',
  ...props
}) => {
  const chosenVariant = chosenVariantFor({ isActive, isToggled, variant });

  return (
    <Tooltip label={title} shortcut={shortcut} side={tooltipSide}>
      <button
        type={type}
        aria-label={title}
        aria-pressed={isActive || isToggled || undefined}
        disabled={disabled}
        className={`inline-flex items-center justify-center shrink-0 select-none cursor-default transition-[background-color,color,transform] duration-150 active:scale-[0.94] disabled:active:scale-100 disabled:cursor-not-allowed ${variantStyles[chosenVariant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {icon}
      </button>
    </Tooltip>
  );
};
