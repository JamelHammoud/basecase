import { useEffect, useRef, useState } from 'react';
import { readableTextOn } from '../utils/markColors';

interface MarkLabelFieldProps {
  label: string;
  color: string;
  autoFocus: boolean;
  onCommit: (label: string) => void;
  onClose: () => void;
}

export function MarkLabelField({ label, color, autoFocus, onCommit, onClose }: MarkLabelFieldProps) {
  const [draft, setDraft] = useState(label);
  const input = useRef<HTMLInputElement | null>(null);
  const reverting = useRef(false);

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <input
      ref={input}
      value={draft}
      spellCheck={false}
      maxLength={80}
      aria-label="Mark label"
      placeholder="e.g. Too thin"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!reverting.current) onCommit(draft);

        reverting.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;

        e.stopPropagation();
        reverting.current = e.key === 'Escape';
        e.currentTarget.blur();
        onClose();
      }}
      style={{ background: color, color: readableTextOn(color) }}
      className="block h-8 min-w-[120px] max-w-[320px] px-3.5 rounded-full [field-sizing:content] text-center text-[13px] font-semibold placeholder:text-current placeholder:opacity-60 outline-none shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-2 ring-transparent focus:ring-[#0d99ff] transition-shadow"
    />
  );
}
