import React, { useRef, useState } from 'react';
import { clampNumber, evaluateMath, formatNumber, stepMultiplier } from './numberInputMath';
import { useNumberScrub } from './useNumberScrub';

export interface NumberInputProps {
  label?: React.ReactNode;
  value: number;
  onChange: (val: number, live?: boolean) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 1,
  unit = 'mm',
  className = '',
  disabled = false,
  title,
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const clamp = (v: number) => clampNumber(v, { min, max, precision });
  const format = (v: number) => formatNumber(v, precision);
  const { scrubbing, handlers } = useNumberScrub({
    value,
    step,
    disabled,
    clamp,
    onChange,
    onClick: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  });

  const commitDraft = () => {
    if (draft === null) return;

    const parsed = evaluateMath(draft);

    if (parsed !== null) onChange(clamp(parsed));

    setDraft(null);
  };

  const stepBy = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    const base = evaluateMath(draft ?? '') ?? value;
    const next = clamp(base + (e.key === 'ArrowUp' ? 1 : -1) * step * stepMultiplier(e));

    setDraft(format(next));
    onChange(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      stepBy(e);

      return;
    }

    if (e.key === 'Enter') commitDraft();
    else if (e.key === 'Escape') setDraft(null);
    else return;

    (e.target as HTMLInputElement).blur();
  };

  return (
    <div
      title={title}
      className={`group relative flex items-center h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.07] ring-1 ring-inset ring-transparent focus-within:ring-[#0d99ff] focus-within:bg-black/20 transition-colors ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      } ${scrubbing ? 'ring-white/[0.12]' : ''} ${className}`}
    >
      {label !== undefined && (
        <span
          {...handlers}
          className="w-7 h-full shrink-0 flex items-center justify-center text-[12px] font-medium text-white/40 group-hover:text-white/60 cursor-ew-resize select-none touch-none"
        >
          {label}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        spellCheck={false}
        disabled={disabled}
        value={draft ?? format(value)}
        onFocus={(e) => {
          setDraft(format(value));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={onKeyDown}
        className={`w-full min-w-0 h-full bg-transparent text-[13px] text-white/90 tabular outline-none ${
          label !== undefined ? 'pl-0' : 'pl-2'
        } ${unit ? 'pr-7' : 'pr-2'}`}
      />
      {unit && (
        <span className="absolute right-2 text-[12px] text-white/30 select-none pointer-events-none">{unit}</span>
      )}
    </div>
  );
};
