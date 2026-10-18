import React from 'react';
import { Tooltip } from './Tooltip';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  title?: string;
  shortcut?: string;
  /** Tints the selected pill red (e.g. Cutout) */
  tone?: 'default' | 'danger';
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (val: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  /** Text tabs without a track (panel headers) */
  variant?: 'pill' | 'tabs';
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
  variant = 'pill',
}: SegmentedControlProps<T>) {
  const found = options.findIndex((o) => o.value === value);
  const idx = Math.max(0, found);
  const selected = found >= 0 ? options[found] : undefined;
  const isTabs = variant === 'tabs';

  return (
    <div
      role="tablist"
      className={`relative grid select-none ${
        isTabs ? 'gap-1' : 'p-0.5 rounded-lg bg-white/[0.05]'
      } ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {/* Sliding thumb */}
      {!isTabs && selected && (
        <span
          aria-hidden
          className={`absolute top-0.5 bottom-0.5 left-0.5 rounded-md transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] ${
            selected?.tone === 'danger' ? 'bg-red-500/80' : 'bg-white/[0.12]'
          }`}
          style={{
            width: `calc((100% - 4px) / ${options.length})`,
            transform: `translateX(${idx * 100}%)`,
          }}
        />
      )}
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const btn = (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-label={opt.label ?? opt.title}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 w-full flex items-center justify-center gap-1.5 font-medium cursor-default transition-colors duration-150 ${
              size === 'sm' ? 'h-7 px-2 text-[12.5px]' : 'h-8 px-2.5 text-[13px]'
            } ${
              isTabs
                ? `rounded-md ${
                    isSelected
                      ? 'text-white bg-white/[0.08]'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                  }`
                : `rounded-md ${isSelected ? 'text-white' : 'text-white/55 hover:text-white/85'}`
            }`}
          >
            {opt.icon && <span className="shrink-0 inline-flex">{opt.icon}</span>}
            {opt.label && <span className="truncate">{opt.label}</span>}
            {opt.badge && <span className="shrink-0">{opt.badge}</span>}
          </button>
        );
        return opt.title ? (
          <Tooltip key={opt.value} label={opt.title} shortcut={opt.shortcut} className="w-full">
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </div>
  );
}
