import React, { useRef, useState } from 'react';

export const RenameField: React.FC<{ name: string; onDone: (name: string) => void }> = ({ name, onDone }) => {
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const finish = (value: string) => {
    if (done.current) return;

    done.current = true;
    onDone(value.trim());
  };

  return (
    <input
      autoFocus
      value={draft}
      spellCheck={false}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(draft);

        if (e.key === 'Escape') finish(name);
      }}
      aria-label="Name"
      className="flex-1 min-w-0 h-7 px-1.5 rounded-md bg-black/30 ring-1 ring-[#0d99ff] outline-none text-[13px] text-white/95"
    />
  );
};
