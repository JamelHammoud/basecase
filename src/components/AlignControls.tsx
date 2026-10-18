import React from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  LucideIcon,
} from 'lucide-react';
import { Divider, IconButton, Tooltip } from '../design-system';
import type { AlignMode, Axis } from '../utils/selection';

const ROWS: Array<{ axis: Axis; label: string; options: Array<[AlignMode, string]> }> = [
  { axis: 0, label: 'X', options: [['min', 'Left'], ['center', 'Center'], ['max', 'Right']] },
  { axis: 1, label: 'Y', options: [['min', 'Bottom'], ['center', 'Middle'], ['max', 'Top']] },
  { axis: 2, label: 'Z', options: [['min', 'Back'], ['center', 'Center'], ['max', 'Front']] },
];

interface AlignControlsProps {
  count: number;
  onAlign: (axis: Axis, mode: AlignMode) => void;
  onDistribute: (axis: Axis) => void;
  /** Called after any action (e.g. to close a menu) */
  onDone?: () => void;
}

/**
 * X/Y/Z × min/center/max grid. Several parts align to their shared bounds;
 * one part aligns to the origin (Bottom = floor).
 */
export const AlignControls: React.FC<AlignControlsProps> = ({ count, onAlign, onDistribute, onDone }) => {
  const single = count === 1;
  const btn =
    'h-7 rounded-md text-[12.5px] text-white/70 hover:text-white hover:bg-white/[0.09] active:scale-[0.97] cursor-default transition-[background-color,color,transform]';

  return (
    <div className="space-y-1">
      {ROWS.map((row) => (
        <div key={row.axis} className="grid grid-cols-[20px_1fr_1fr_1fr] items-center gap-0.5">
          <span className="text-[12px] font-medium text-white/40 text-center">{row.label}</span>
          {row.options.map(([mode, label]) => (
            <Tooltip
              key={mode}
              className="w-full"
              label={single ? (row.axis === 1 && mode === 'min' ? 'Bottom to floor' : `${label} to origin`) : `Align ${label.toLowerCase()}`}
            >
              <button
                type="button"
                onClick={() => {
                  onAlign(row.axis, mode);
                  onDone?.();
                }}
                className={`w-full ${btn}`}
              >
                {label}
              </button>
            </Tooltip>
          ))}
        </div>
      ))}
      {count >= 3 && (
        <>
          <Divider className="mt-1 mb-1" />
          <div className="grid grid-cols-[20px_1fr_1fr_1fr] items-center gap-0.5">
            <span />
            <span className="text-[12px] text-white/40 pl-1">Spread</span>
            {([0, 2] as Axis[]).map((axis) => (
              <Tooltip key={axis} className="w-full" label={`Even spacing along ${axis === 0 ? 'X' : 'Z'}`}>
                <button
                  type="button"
                  onClick={() => {
                    onDistribute(axis);
                    onDone?.();
                  }}
                  className={`w-full ${btn}`}
                >
                  {axis === 0 ? 'X' : 'Z'}
                </button>
              </Tooltip>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const BAR_ROWS: Array<{ axis: Axis; label: string; spread: LucideIcon; options: Array<[AlignMode, string, LucideIcon]> }> = [
  { axis: 0, label: 'X', spread: AlignHorizontalSpaceAround, options: [['min', 'Align left', AlignStartVertical], ['center', 'Align center', AlignCenterVertical], ['max', 'Align right', AlignEndVertical]] },
  { axis: 1, label: 'Y', spread: AlignVerticalSpaceAround, options: [['min', 'Align bottom', AlignEndHorizontal], ['center', 'Align middle', AlignCenterHorizontal], ['max', 'Align top', AlignStartHorizontal]] },
  { axis: 2, label: 'Z', spread: AlignHorizontalSpaceAround, options: [['min', 'Align back', AlignStartVertical], ['center', 'Align center', AlignCenterVertical], ['max', 'Align front', AlignEndVertical]] },
];

/**
 * The inspector's align controls: one icon strip per axis (min · center · max) and Spread.
 * Same actions as AlignControls, which stays the right-click submenu.
 */
export const AlignBar: React.FC<Omit<AlignControlsProps, 'onDone'>> = ({ count, onAlign, onDistribute }) => (
  <div className="space-y-1.5">
    {BAR_ROWS.map((row) => (
      <div key={row.axis} className="grid grid-cols-[14px_1fr_32px] items-center gap-2">
        <span className="text-[12px] font-medium text-white/40 text-center select-none">{row.label}</span>
        <StripGroup>
          {row.options.map(([mode, label, Icon]) => (
            <StripButton key={mode} title={label} onClick={() => onAlign(row.axis, mode)}>
              <Icon className="w-4 h-4" />
            </StripButton>
          ))}
        </StripGroup>
        <IconButton
          icon={<row.spread className="w-4 h-4" />}
          title={count >= 3 ? `Spread evenly along ${row.label}` : 'Spread needs 3 or more parts'}
          disabled={count < 3}
          onClick={() => onDistribute(row.axis)}
        />
      </div>
    ))}
  </div>
);

/** A row of equal buttons on one soft track (align, combine) */
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
