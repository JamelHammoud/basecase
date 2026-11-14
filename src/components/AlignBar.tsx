import React from 'react';
import { IconButton, Tooltip } from '../design-system';
import type { AlignMode, Axis } from '../utils/selection';
import { ALIGN_AXES, singlePartAlignTitle } from './alignActions';

interface AlignBarProps {
  count: number;
  onAlign: (axis: Axis, mode: AlignMode) => void;
  onDistribute: (axis: Axis) => void;
  onDone?: () => void;
}

export const AlignBar: React.FC<AlignBarProps> = ({ count, onAlign, onDistribute, onDone }) => {
  const canSpread = count >= 3;
  const then = (action: () => void) => () => {
    action();
    onDone?.();
  };

  return (
    <div className="space-y-1.5">
      {ALIGN_AXES.map((row) => (
        <div
          key={row.axis}
          className={`grid items-center gap-2 ${canSpread ? 'grid-cols-[14px_1fr_32px]' : 'grid-cols-[14px_1fr]'}`}
        >
          <span className="text-[12px] font-medium text-white/50 text-center select-none">{row.name}</span>
          <StripGroup>
            {row.aligns.map((action) => (
              <StripButton
                key={action.mode}
                title={count === 1 ? singlePartAlignTitle(row.axis, action) : action.label}
                onClick={then(() => onAlign(row.axis, action.mode))}
              >
                <action.icon className="w-4 h-4" />
              </StripButton>
            ))}
          </StripGroup>
          {canSpread && (
            <IconButton
              icon={<row.spread.icon className="w-4 h-4" />}
              title={row.spread.label}
              onClick={then(() => onDistribute(row.axis))}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export const StripGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex rounded-lg bg-white/[0.05] p-[2px] gap-[2px]">{children}</div>
);

export const StripButton: React.FC<{
  title?: string;
  shortcut?: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}> = ({ title, shortcut, onClick, className = '', children }) => {
  const button = (
    <button
      type="button"
      aria-label={title}
      onClick={onClick}
      className={`flex-1 min-w-0 h-[32px] rounded-md flex items-center justify-center gap-1.5 text-[13px] text-white/65 hover:text-white hover:bg-white/[0.08] active:scale-[0.96] cursor-default transition-[background-color,color,transform] duration-150 ${className}`}
    >
      {children}
    </button>
  );

  if (!title) return button;

  return (
    <Tooltip label={title} shortcut={shortcut} className="flex-1 min-w-0">
      {button}
    </Tooltip>
  );
};
