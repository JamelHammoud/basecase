import React from 'react';
import { Tooltip } from './Tooltip';
import { CHOICE_TRACK, choiceCellClass } from './choiceStyles';

export interface ChoiceOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}

export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  columns,
  stacked = false,
  label,
  className = '',
}: {
  options: ChoiceOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  columns: number;
  stacked?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid select-none ${CHOICE_TRACK} ${className}`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        const cell = (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`w-full min-w-0 flex items-center justify-center ${
              stacked ? 'h-[56px] flex-col gap-[6px] text-[12px]' : 'h-8 gap-1.5 px-1.5 text-[13px]'
            } ${choiceCellClass(selected)}`}
          >
            {o.icon && <span className="shrink-0 inline-flex">{o.icon}</span>}
            <span className="truncate max-w-full">{o.label}</span>
          </button>
        );

        return o.title ? (
          <Tooltip key={o.value} label={o.title} className="w-full min-w-0">
            {cell}
          </Tooltip>
        ) : (
          cell
        );
      })}
    </div>
  );
}
