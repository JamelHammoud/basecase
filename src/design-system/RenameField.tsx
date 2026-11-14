import React, { useRef, useState } from 'react';
import { renamedTo } from './renamedTo';

export interface RenameFieldProps {
  name: string;
  onDone: (name: string | null) => void;
  label?: string;
  className?: string;
}

const keepToSelf = (e: React.SyntheticEvent) => e.stopPropagation();

export const RenameField: React.FC<RenameFieldProps> = ({ name, onDone, label = 'Name', className = '' }) => {
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;

    done.current = true;
    onDone(renamedTo(name, value));
  };

  return (
    <input
      type="text"
      autoFocus
      value={draft}
      spellCheck={false}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(draft)}
      onPointerDown={keepToSelf}
      onClick={keepToSelf}
      onDoubleClick={keepToSelf}
      onKeyDown={(e) => {
        e.stopPropagation();

        if (e.key === 'Enter') finish(draft);

        if (e.key === 'Escape') finish(null);
      }}
      className={`flex-1 min-w-0 h-6 px-1.5 rounded-md bg-black/30 ring-1 ring-[#0d99ff] outline-none text-[13px] text-white/95 ${className}`}
    />
  );
};
