import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { Kbd } from '../design-system';

export interface Command {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  shortcut?: string;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

function matchScore(label: string, q: string) {
  const l = label.toLowerCase();

  if (l.startsWith(q)) return 0;

  return l.includes(q) ? 1 : 2;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, commands }) => {
  if (!open) return null;

  return createPortal(<PaletteBody onClose={onClose} commands={commands} />, document.body);
};

const PaletteBody: React.FC<Omit<CommandPaletteProps, 'open'>> = ({ onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return commands;

    const terms = q.split(/\s+/);

    return commands
      .map((c) => {
        const hay = `${c.label} ${c.group} ${c.keywords || ''}`.toLowerCase();

        if (!terms.every((t) => hay.includes(t))) return null;

        return { c, score: matchScore(c.label, q) };
      })
      .filter((x): x is { c: Command; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c);
  }, [query, commands]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c?: Command) => {
    if (!c) return;

    onClose();
    c.run();
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex justify-center pt-[14vh] bg-black/30 animate-fade-in"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-menu w-[600px] max-w-[calc(100vw-48px)] h-fit max-h-[62vh] rounded-[20px] flex flex-col overflow-hidden animate-sheet-in">
        <div className="flex items-center gap-3 px-5 h-14 border-b border-white/[0.08] shrink-0">
          <Search className="w-5 h-5 text-white/40 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(results[active]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="e.g. servo, Top View, Group"
            className="flex-1 bg-transparent text-[16px] text-white outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} className="overflow-y-auto p-2">
          {results.length === 0 && <div className="py-10 text-center text-[14px] text-white/45">No results</div>}
          {results.map((c, idx) => {
            const header = idx === 0 || results[idx - 1].group !== c.group ? c.group : null;
            const isActive = idx === active;

            return (
              <React.Fragment key={c.id}>
                {header && <div className="px-3 pt-3 pb-1.5 text-[12px] font-medium text-white/40">{header}</div>}
                <button
                  type="button"
                  data-idx={idx}
                  onPointerMove={() => setActive(idx)}
                  onClick={() => run(c)}
                  className={`w-full h-10 px-3 rounded-xl flex items-center gap-3 text-left text-[14px] cursor-default ${
                    isActive ? 'bg-white/[0.09] text-white' : 'text-white/80'
                  }`}
                >
                  <span className={`w-5 flex justify-center shrink-0 ${isActive ? 'text-white' : 'text-white/50'}`}>
                    {c.icon}
                  </span>
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.shortcut && <Kbd>{c.shortcut}</Kbd>}
                  {isActive && !c.shortcut && <CornerDownLeft className="w-3.5 h-3.5 text-white/40" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
