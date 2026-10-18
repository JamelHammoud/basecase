import React, { useState } from 'react';

const EXAMPLE_INTERVAL_MS = 3600;

export const CyclingPlaceholder: React.FC<{ examples: string[] }> = ({ examples }) => {
  const [index, setIndex] = useState(0);

  const example = examples[index];

  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 px-4 pt-3 text-[14px] leading-relaxed text-white/[0.32] pointer-events-none whitespace-nowrap overflow-hidden"
    >
      <span
        key={example}
        className="inline-block [animation:placeholder-cycle_var(--cycle)_linear_both] motion-reduce:[animation:none] [mask-image:linear-gradient(to_right,black_35%,transparent_65%)] [mask-size:300%_100%]"
        style={{ '--cycle': `${EXAMPLE_INTERVAL_MS}ms` } as React.CSSProperties}
        onAnimationEnd={() => setIndex((i) => (i + 1) % examples.length)}
      >
        {example}
      </span>
    </div>
  );
};
