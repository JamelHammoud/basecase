import React, { useRef } from 'react';

export interface SliderProps {
  label: string;
  value: number;
  onChange: (val: number, live?: boolean) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  defaultValue?: number;
  stacked?: boolean;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  defaultValue,
  stacked = false,
  className = '',
}) => {
  const draggingRef = useRef(false);
  const lastRef = useRef(value);
  const fill = ((value - min) / (max - min)) * 100;

  const labelText = <span className="text-[13px] text-white/60 truncate select-none">{label}</span>;
  const valueText = <span className="text-[13px] text-white/90 tabular text-right select-none">{format(value)}</span>;
  const track = (
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
  );

  if (stacked)
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <div className="flex items-center justify-between gap-3 h-6">
          {labelText}
          {valueText}
        </div>
        <div className="h-6 flex items-center">{track}</div>
      </div>
    );

  return (
    <div className={`grid grid-cols-[64px_1fr_48px] items-center gap-3 h-8 ${className}`}>
      {labelText}
      {track}
      {valueText}
    </div>
  );
};
