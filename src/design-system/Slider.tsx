import React, { useRef } from 'react';

export interface SliderProps {
  label: string;
  value: number;
  /** `live` is true while dragging so callers can skip undo history until release */
  onChange: (val: number, live?: boolean) => void;
  min: number;
  max: number;
  step?: number;
  /** Formats the trailing value readout */
  format?: (v: number) => string;
  /** Value the slider resets to on double-click */
  defaultValue?: number;
  className?: string;
}

/** Inspector slider: label · thin track · tabular value. Double-click resets. */
export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  defaultValue,
  className = '',
}) => {
  const draggingRef = useRef(false);
  const lastRef = useRef(value);
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <div className={`grid grid-cols-[64px_1fr_48px] items-center gap-3 h-8 ${className}`}>
      <span className="text-[13px] text-white/60 truncate select-none">{label}</span>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onPointerDown={() => {
          draggingRef.current = true;
          lastRef.current = value;
        }}
        onPointerUp={() => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          onChange(lastRef.current, false);
        }}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue, false)}
        onChange={(e) => {
          const v = Number(e.target.value);
          lastRef.current = v;
          onChange(v, draggingRef.current);
        }}
      />
      <span className="text-[13px] text-white/90 tabular text-right select-none">
        {format(value)}
      </span>
    </div>
  );
};
