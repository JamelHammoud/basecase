import React from 'react';

export interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export const Kbd: React.FC<KbdProps> = ({ children, className = '' }) => {
  const keys = typeof children === 'string' ? splitKeys(children) : [children];

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-[4px] bg-white/[0.08] text-[11px] font-medium text-white/60 font-sans leading-none"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
};

function splitKeys(s: string): string[] {
  if (/^[A-Za-z]{2,}$/.test(s)) return [s];

  const out: string[] = [];
  const re = /(Space|Esc|Tab|Enter|Shift|Drag|↩︎|[⌘⇧⌥⌃⌫]|.)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(s))) {
    if (m[0].trim()) out.push(m[0]);
  }

  return out;
}
