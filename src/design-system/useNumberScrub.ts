import React, { useEffect, useRef, useState } from 'react';
import { stepMultiplier } from './numberInputMath';

interface NumberScrubOptions {
  value: number;
  step: number;
  disabled: boolean;
  clamp: (v: number) => number;
  onChange: (val: number, live?: boolean) => void;
  onClick: () => void;
}

export function useNumberScrub({ value, step, disabled, clamp, onChange, onClick }: NumberScrubOptions) {
  const [scrubbing, setScrubbing] = useState(false);
  const scrubRef = useRef<{ startX: number; startValue: number; last: number } | null>(null);

  useEffect(() => {
    if (!scrubbing) return;

    const prevCursor = document.body.style.cursor;

    document.body.style.cursor = 'ew-resize';

    return () => {
      document.body.style.cursor = prevCursor;
    };
  }, [scrubbing]);

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled || e.button !== 0) return;

    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    scrubRef.current = { startX: e.clientX, startValue: value, last: value };
    setScrubbing(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const s = scrubRef.current;

    if (!s) return;

    const dx = e.clientX - s.startX;
    const next = clamp(s.startValue + Math.round(dx / 2) * step * stepMultiplier(e));

    if (next === s.last) return;

    s.last = next;
    onChange(next, true);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    const s = scrubRef.current;

    if (!s) return;

    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    scrubRef.current = null;
    setScrubbing(false);

    if (s.last !== s.startValue) onChange(s.last, false);
    else onClick();
  };

  return { scrubbing, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}
