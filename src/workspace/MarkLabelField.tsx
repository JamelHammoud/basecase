import { useRef, useState } from 'react';

interface MarkLabelFieldProps {
  label: string;
  autoFocus: boolean;
  onCommit: (label: string) => void;
}

export function MarkLabelField({ label, autoFocus, onCommit }: MarkLabelFieldProps) {
  const [draft, setDraft] = useState(label);
  const reverting = useRef(false);

  return (
    <input
      value={draft}
      autoFocus={autoFocus}
      spellCheck={false}
      maxLength={80}
      aria-label="Mark label"
      placeholder="e.g. Too thick here"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!reverting.current) onCommit(draft);

        reverting.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();

        if (e.key !== 'Escape') return;

        e.stopPropagation();
        reverting.current = true;
        setDraft(label);
        e.currentTarget.blur();
      }}
      className="w-[220px] h-8 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.08] focus:bg-black/25 text-[13px] text-white/90 placeholder:text-white/35 outline-none ring-1 ring-inset ring-transparent focus:ring-[#0d99ff] transition-colors"
    />
  );
}
