import React, { useLayoutEffect, useRef, useState } from 'react';
import { ThoughtIcon } from '../../design-system';
import { DisclosureBody, DisclosureChevron } from './Disclosure';
import { SHIMMER_TEXT } from './shimmer';

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
        <ThoughtIcon className="w-4 h-4" />
        {live ? <span className={SHIMMER_TEXT}>Thinking</span> : <span>Thought</span>}
        <DisclosureChevron open={open} group="thought" />
      </button>
      <DisclosureBody open={open} onClose={() => setOverride(false)}>
        <div
          ref={windowRef}
          className={`pl-6 pr-1 ${live ? 'max-h-[132px] overflow-hidden' : ''}`}
          style={{ maskImage: fade, WebkitMaskImage: fade }}
        >
          <p className="text-[13px] leading-[21px] text-white/50 whitespace-pre-wrap [overflow-wrap:anywhere] select-text pt-0.5 pb-1">
            {text.trim()}
          </p>
        </div>
      </DisclosureBody>
    </div>
  );
};
