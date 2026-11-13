import React from 'react';
import {
  IconButton,
  Tooltip,
  AlignBottomIcon,
  AlignCenterXIcon,
  AlignCenterYIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  GlyphIcon,
  SpreadXIcon,
  SpreadYIcon,
} from '../design-system';
import type { AlignMode, Axis } from '../utils/selection';

const BAR_ROWS: Array<{
  axis: Axis;
  label: string;
  spread: GlyphIcon;
  options: Array<[AlignMode, string, GlyphIcon]>;
}> = [
  {
    axis: 0,
    label: 'X',
    spread: SpreadXIcon,
    options: [
      ['min', 'Left', AlignLeftIcon],
      ['center', 'Center', AlignCenterXIcon],
      ['max', 'Right', AlignRightIcon],
    ],
  },
  {
    axis: 1,
    label: 'Y',
    spread: SpreadYIcon,
    options: [
      ['min', 'Bottom', AlignBottomIcon],
      ['center', 'Middle', AlignCenterYIcon],
      ['max', 'Top', AlignTopIcon],
    ],
  },
  {
    axis: 2,
    label: 'Z',
    spread: SpreadXIcon,
    options: [
      ['min', 'Back', AlignLeftIcon],
      ['center', 'Center', AlignCenterXIcon],
      ['max', 'Front', AlignRightIcon],
    ],
  },
];

const alignTitle = ({ single, axis, mode, side }: { single: boolean; axis: Axis; mode: AlignMode; side: string }) => {
  if (!single) return `Align ${side.toLowerCase()}`;

  return axis === 1 && mode === 'min' ? 'Bottom to floor' : `${side} to origin`;
};

interface AlignBarProps {
  count: number;
  onAlign: (axis: Axis, mode: AlignMode) => void;
  onDistribute: (axis: Axis) => void;
  onDone?: () => void;
}

export const AlignBar: React.FC<AlignBarProps> = ({ count, onAlign, onDistribute, onDone }) => {
  const then = (action: () => void) => () => {
    action();
    onDone?.();
  };

  return (
    <div className="space-y-1.5">
      {BAR_ROWS.map((row) => (
        <div key={row.axis} className="grid grid-cols-[14px_1fr_32px] items-center gap-2">
          <span className="text-[12px] font-medium text-white/50 text-center select-none">{row.label}</span>
          <StripGroup>
            {row.options.map(([mode, side, Icon]) => (
              <StripButton
                key={mode}
                title={alignTitle({ single: count === 1, axis: row.axis, mode, side })}
                onClick={then(() => onAlign(row.axis, mode))}
              >
                <Icon className="w-4 h-4" />
              </StripButton>
            ))}
          </StripGroup>
          <IconButton
            icon={<row.spread className="w-4 h-4" />}
            title={count >= 3 ? `Spread evenly along ${row.label}` : 'Spread needs 3 or more parts'}
            disabled={count < 3}
            onClick={then(() => onDistribute(row.axis))}
          />
        </div>
      ))}
    </div>
  );
};

export const StripGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex h-8 rounded-lg bg-white/[0.05] p-[2px] gap-[2px]">{children}</div>
);

export const StripButton: React.FC<{
  title: string;
  shortcut?: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}> = ({ title, shortcut, onClick, className = '', children }) => (
  <Tooltip label={title} shortcut={shortcut} className="flex-1 min-w-0">
    <button
      type="button"
      aria-label={title}
      onClick={onClick}
      className={`flex-1 min-w-0 rounded-md flex items-center justify-center gap-1.5 text-[13px] text-white/65 hover:text-white hover:bg-white/[0.08] active:scale-[0.96] cursor-default transition-[background-color,color,transform] duration-150 ${className}`}
    >
      {children}
    </button>
  </Tooltip>
);
