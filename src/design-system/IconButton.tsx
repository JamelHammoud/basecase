import React from 'react';
import { sizeRadius } from './sizeRadius';
import { Tooltip, TooltipSide } from './Tooltip';

export type IconButtonVariant = 'default' | 'active' | 'ghost' | 'danger' | 'primary' | 'toggled' | 'send';
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
  ghost: 'text-white/50 hover:text-white/90 hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent',
  active: 'bg-[#0d99ff] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
  toggled: 'bg-white/[0.1] text-white',
  danger: 'text-white/50 hover:text-red-400 hover:bg-red-500/[0.12] disabled:opacity-30',
  primary: 'bg-[#0d99ff] hover:bg-[#2ba5ff] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
  send: 'bg-white text-black hover:bg-white/90 disabled:bg-white/15 disabled:text-white/40',
};

const sizeStyles: Record<IconButtonSize, string> = {
  xs: 'w-[28px] h-[28px]',
  sm: 'w-[32px] h-[32px]',
  md: 'w-[36px] h-[36px]',
  lg: 'w-[44px] h-[44px]',
};

const radiusStyles: Record<IconButtonSize, string> = {
  xs: 'rounded-lg',
  sm: 'rounded-lg',
  md: 'rounded-[10px]',
  lg: 'rounded-[14px]',
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
        className={`inline-flex items-center justify-center shrink-0 select-none cursor-default transition-[background-color,color,transform] duration-150 active:scale-[0.94] disabled:active:scale-100 disabled:cursor-not-allowed ${variantStyles[chosenVariant]} ${sizeStyles[size]} ${sizeRadius(radiusStyles[size], className)} ${className}`}
        {...props}
      >
        {icon}
      </button>
    </Tooltip>
  );
};
