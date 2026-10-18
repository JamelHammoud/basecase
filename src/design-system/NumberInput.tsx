import React, { useEffect, useRef, useState } from 'react';

export interface NumberInputProps {
  /** Short prefix label (X, W, °). Drag it horizontally to scrub the value. */
  label?: React.ReactNode;
  value: number;
  /** `live` is true while scrubbing so callers can skip undo history until release */
  onChange: (val: number, live?: boolean) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Decimal places shown and committed */
  precision?: number;
  unit?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * Figma-style parametric field.
 * - Drag the label to scrub (Shift ×10, Option ×0.1)
 * - ↑/↓ steps, Enter commits, Esc reverts
 * - Accepts simple math: "40/2", "12+3.5"
 */
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
  const [scrubbing, setScrubbing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrubRef = useRef<{ startX: number; startValue: number; last: number } | null>(null);

  const clamp = (v: number) => {
    let n = v;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    const f = Math.pow(10, precision);
    return Math.round(n * f) / f;
  };

  const format = (v: number) => {
    if (!Number.isFinite(v)) return '';
    const f = Math.pow(10, precision);
    return String(Math.round(v * f) / f);
  };

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = evaluate(draft);
    if (parsed !== null) onChange(clamp(parsed));
    setDraft(null);
  };

  useEffect(() => {
    if (!scrubbing) return;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'ew-resize';
    return () => {
      document.body.style.cursor = prevCursor;
    };
  }, [scrubbing]);

  const onScrubDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    scrubRef.current = { startX: e.clientX, startValue: value, last: value };
    setScrubbing(true);
  };

  const onScrubMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const s = scrubRef.current;
    if (!s) return;
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const dx = e.clientX - s.startX;
    const next = clamp(s.startValue + Math.round(dx / 2) * step * mult);
    if (next !== s.last) {
      s.last = next;
      onChange(next, true);
    }
  };

  const onScrubUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    const s = scrubRef.current;
    if (!s) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    scrubRef.current = null;
    setScrubbing(false);
    if (s.last !== s.startValue) {
      onChange(s.last, false);
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
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
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerCancel={onScrubUp}
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
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitDraft();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = evaluate(draft ?? '') ?? value;
            const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
            const next = clamp(base + (e.key === 'ArrowUp' ? 1 : -1) * step * mult);
            setDraft(format(next));
            onChange(next);
          }
        }}
        className={`w-full min-w-0 h-full bg-transparent text-[13px] text-white/90 tabular outline-none ${
          label !== undefined ? 'pl-0' : 'pl-2'
        } ${unit ? 'pr-7' : 'pr-2'}`}
      />
      {unit && (
        <span className="absolute right-2 text-[12px] text-white/30 select-none pointer-events-none">
          {unit}
        </span>
      )}
    </div>
  );
};

/** Tiny safe arithmetic evaluator: numbers, + - * / and parentheses */
function evaluate(input: string): number | null {
  const src = input.replace(/mm|°|%/g, '').trim();
  if (!src) return null;
  if (!/^[\d\s.+\-*/()]+$/.test(src)) return null;
  let i = 0;
  const peek = () => src[i];
  const skip = () => {
    while (src[i] === ' ') i++;
  };
  const parseNumber = (): number | null => {
    skip();
    const start = i;
    while (i < src.length && /[\d.]/.test(src[i])) i++;
    if (start === i) return null;
    const n = parseFloat(src.slice(start, i));
    return Number.isFinite(n) ? n : null;
  };
  const parseFactor = (): number | null => {
    skip();
    if (peek() === '-') {
      i++;
      const v = parseFactor();
      return v === null ? null : -v;
    }
    if (peek() === '(') {
      i++;
      const v = parseExpr();
      skip();
      if (peek() !== ')') return null;
      i++;
      return v;
    }
    return parseNumber();
  };
  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    for (;;) {
      skip();
      const op = peek();
      if (op !== '*' && op !== '/') return left;
      i++;
      const right = parseFactor();
      if (right === null) return null;
      left = op === '*' ? left * right : right === 0 ? left : left / right;
    }
  };
  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    for (;;) {
      skip();
      const op = peek();
      if (op !== '+' && op !== '-') return left;
      i++;
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
  };
  const result = parseExpr();
  skip();
  return i === src.length ? result : null;
}
