import React, { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

const FEED_FADE_PX = 28;

const UNSTICK_KEYS = ['ArrowUp', 'PageUp', 'Home'];

const distanceFromBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight;

export function feedMask({ top, bottom }: { top: boolean; bottom: boolean }) {
  if (!top && !bottom) return undefined;

  const start = top ? `transparent 0, #000 ${FEED_FADE_PX}px` : '#000 0';
  const end = bottom ? `#000 calc(100% - ${FEED_FADE_PX}px), transparent 100%` : '#000 100%';

  return `linear-gradient(to bottom, ${start}, ${end})`;
}

const scrolledInside = (target: EventTarget) => {
  const inner = (target as HTMLElement).closest('[data-inner-scroll]');

  return !!inner && inner.scrollTop > 0;
};

export function useFeedFollow({ messages, status }: { messages: readonly unknown[]; status: string }) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const feedContentRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [edgeFade, setEdgeFade] = useState({ top: false, bottom: false });

  const updateEdgeFade = (el: HTMLElement) => {
    const top = el.scrollTop > 1;
    const bottom = distanceFromBottom(el) > 1;

    setEdgeFade((f) => (f.top === top && f.bottom === bottom ? f : { top, bottom }));
  };

  const unstick = () => {
    const el = feedRef.current;

    if (!el || el.scrollHeight <= el.clientHeight) return;

    stickRef.current = false;
  };

  const scrollToBottom = (smooth = false) => {
    const el = feedRef.current;

    stickRef.current = true;
    setShowJump(false);

    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const followContent = useEffectEvent((el: HTMLElement) => {
    if (stickRef.current) el.scrollTop = el.scrollHeight;

    updateEdgeFade(el);
  });

  useLayoutEffect(() => {
    const el = feedRef.current;

    if (el) followContent(el);
  }, [messages, status]);

  const isEmpty = messages.length === 0;

  useEffect(() => {
    const el = feedRef.current;
    const content = feedContentRef.current;

    if (!el || !content) return;

    const observer = new ResizeObserver(() => followContent(el));

    observer.observe(content);
    observer.observe(el);

    return () => observer.disconnect();
  }, [isEmpty]);

  const onWheel = (e: React.WheelEvent<HTMLElement>) => {
    if (e.deltaY >= 0 || scrolledInside(e.target)) return;

    unstick();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (UNSTICK_KEYS.includes(e.key) || (e.key === ' ' && e.shiftKey)) unstick();
  };

  const onScroll = (e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget;

    if (distanceFromBottom(el) < 4) stickRef.current = true;
    else if ('scrollbarDrag' in el.dataset) unstick();

    setShowJump(!stickRef.current && distanceFromBottom(el) > 80);
    updateEdgeFade(el);
  };

  return {
    feedRef,
    feedContentRef,
    edgeFade,
    showJump,
    scrollToBottom,
    feedHandlers: { onWheel, onKeyDown, onScroll },
  };
}
