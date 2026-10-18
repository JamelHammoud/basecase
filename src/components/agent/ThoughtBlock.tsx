import React, { useLayoutEffect, useRef, useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';

export const ThoughtBlock: React.FC<{ text: string; live: boolean }> = ({ text, live }) => {
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? live;
  const [clipped, setClipped] = useState(false);
  const windowRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = windowRef.current;

    if (!el || !live) return;

    el.scrollTop = el.scrollHeight;
    setClipped(el.scrollHeight > el.clientHeight + 2);
  }, [text, live, open]);

  const fade = live && clipped ? 'linear-gradient(to bottom, transparent 0, #000 36px, #000 100%)' : undefined;

  return (
    <div className="animate-fade-in min-w-0">
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className="group/thought h-7 -ml-1 pl-1 pr-2 rounded-md flex items-center gap-2 text-[13px] text-white/45 hover:text-white/80 hover:bg-white/[0.04] cursor-default transition-colors"
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          <Brain className="w-3.5 h-3.5" strokeWidth={2} />
        </span>
        {live ? (
          <span className="bg-[linear-gradient(90deg,rgba(255,255,255,0.35),rgba(255,255,255,0.85),rgba(255,255,255,0.35))] bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer">
            Thinking
          </span>
        ) : (
          <span>Thought</span>
        )}
        <ChevronRight
          className={`-ml-1 w-3.5 h-3.5 opacity-60 group-hover/thought:opacity-100 transition-[transform,opacity] duration-200 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)] ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            ref={windowRef}
            className={`pl-6 pr-1 ${live ? 'max-h-[132px] overflow-hidden' : ''}`}
            style={{ maskImage: fade, WebkitMaskImage: fade }}
          >
            <p className="text-[13px] leading-[21px] text-white/50 whitespace-pre-wrap [overflow-wrap:anywhere] select-text pt-0.5 pb-1">
              {text.trim()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
