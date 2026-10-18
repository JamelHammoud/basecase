import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export const AutoTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}> = ({ value, onChange, placeholder, autoFocus, className, onKeyDown }) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;

    if (!el) return;

    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    el.style.overflowY = el.scrollHeight > 140 ? 'auto' : 'hidden';
  }, [value]);
  useEffect(() => {
    if (!autoFocus) return;

    const id = requestAnimationFrame(() => {
      const el = ref.current;

      if (!el) return;

      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    });

    return () => cancelAnimationFrame(id);
  }, [autoFocus]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      spellCheck
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={className}
    />
  );
};

export const CommentComposer: React.FC<{
  placeholder: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => void;
  onEscape: () => void;
}> = ({ placeholder, autoFocus, onSubmit, onEscape }) => {
  const [value, setValue] = useState('');
  const send = () => {
    const v = value.trim();

    if (!v) return;

    onSubmit(v);
    setValue('');
  };

  return (
    <div className="flex items-end gap-2 p-2 pl-3">
      <AutoTextarea
        autoFocus={autoFocus}
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onEscape();
          }
        }}
        className="flex-1 bg-transparent py-1.5 text-[13.5px] leading-relaxed text-white outline-none resize-none"
      />
      <button
        type="button"
        aria-label="Post"
        disabled={!value.trim()}
        onClick={send}
        className="w-7 h-7 mb-0.5 rounded-full bg-[#0d99ff] text-white flex items-center justify-center shrink-0 cursor-default transition-[transform,background-color] active:scale-[0.92] disabled:bg-white/10 disabled:text-white/35"
      >
        <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
};
