import React, { useEffect, useEffectEvent, useRef } from 'react';

export const LoadMore: React.FC<{ onReach: () => void }> = ({ onReach }) => {
  const ref = useRef<HTMLDivElement>(null);
  const reach = useEffectEvent(onReach);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;

    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && reach(), {
      rootMargin: '400px',
    });

    io.observe(el);

    return () => io.disconnect();
  }, []);

  return <div ref={ref} className="h-px" aria-hidden />;
};
