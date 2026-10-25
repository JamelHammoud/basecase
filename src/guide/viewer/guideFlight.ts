import { springTiming } from './springEasing';

export interface CoverOrigin {
  rect: DOMRect;
  tiltX: number;
  tiltY: number;
}

export interface FlightStage {
  backdrop: HTMLElement;
  chrome: HTMLElement;
  slots: HTMLElement[];
  reduced: boolean;
}

const THUMB_RADIUS_PX = 6;
const PAGE_RADIUS_PX = 3;
const THUMB_PERSPECTIVE_PX = 320;
const RISE_PX = 56;
const FOLLOWERS = 3;
const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

const FLY_IN = springTiming({ response: 0.62, damping: 0.8 });
const SETTLE = springTiming({ response: 0.7, damping: 0.5 });
const RISE = springTiming({ response: 0.6, damping: 0.9 });
const FLY_OUT = springTiming({ response: 0.46, damping: 1 });

const SHADOW_REST = '0 18px 48px -18px rgba(0, 0, 0, 0.7)';
const SHADOW_THUMB = '0 4px 10px -2px rgba(0, 0, 0, 0.45)';
const SHADOW_LIFT = '0 48px 110px -24px rgba(0, 0, 0, 0.85)';

const finished = (animations: Animation[]) => Promise.all(animations.map((a) => a.finished.catch(() => undefined)));

function coverTransform(origin: DOMRect, slot: HTMLElement) {
  const target = slot.getBoundingClientRect();
  const scale = origin.width / target.width;

  return {
    scale,
    from: `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${scale})`,
  };
}

function tilt(slot: HTMLElement, { scale, x, y }: { scale: number; x: number; y: number }) {
  const w = slot.offsetWidth / 2;
  const h = slot.offsetHeight / 2;
  const perspective = THUMB_PERSPECTIVE_PX / scale;

  return `translate(${w}px, ${h}px) perspective(${perspective}px) rotateX(${x}deg) rotateY(${y}deg) translate(${-w}px, ${-h}px)`;
}

function fadeChrome(stage: FlightStage, show: boolean): Animation[] {
  const hidden = { opacity: 0, transform: 'translateY(8px)' };
  const shown = { opacity: 1, transform: 'none' };

  return [
    stage.backdrop.animate([{ opacity: show ? 0 : 1 }, { opacity: show ? 1 : 0 }], {
      duration: show ? 420 : 320,
      easing: show ? EASE_OUT : EASE_IN,
      delay: show ? 0 : 60,
      fill: 'both',
    }),
    stage.chrome.animate(show ? [hidden, shown] : [shown, hidden], {
      duration: show ? 360 : 140,
      delay: show ? 240 : 0,
      easing: show ? EASE_OUT : EASE_IN,
      fill: 'both',
    }),
  ];
}

function riseFollowers(slots: HTMLElement[]): Animation[] {
  return slots.slice(1, 1 + FOLLOWERS).map((slot, i) =>
    slot.animate(
      [
        { opacity: 0, transform: `translateY(${RISE_PX}px) scale(0.97)` },
        { opacity: 1, transform: 'none' },
      ],
      { ...RISE, delay: 180 + 70 * i, fill: 'backwards' },
    ),
  );
}

function flyCover(slot: HTMLElement, origin: CoverOrigin): Animation[] {
  const { scale, from } = coverTransform(origin.rect, slot);

  return [
    slot.animate(
      [
        { transform: from, borderRadius: `${THUMB_RADIUS_PX / scale}px` },
        { transform: 'none', borderRadius: `${PAGE_RADIUS_PX}px` },
      ],
      { ...FLY_IN, fill: 'backwards' },
    ),
    slot.animate(
      [
        { transform: tilt(slot, { scale, x: origin.tiltX + 6, y: origin.tiltY }) },
        { transform: tilt(slot, { scale, x: 0, y: 0 }) },
      ],
      { ...SETTLE, composite: 'add', fill: 'backwards' },
    ),
    slot.animate([{ boxShadow: SHADOW_THUMB }, { boxShadow: SHADOW_LIFT, offset: 0.45 }, { boxShadow: SHADOW_REST }], {
      duration: FLY_IN.duration,
      easing: EASE_OUT,
      fill: 'backwards',
    }),
  ];
}

function riseCover(slot: HTMLElement): Animation[] {
  return [
    slot.animate(
      [
        { opacity: 0, transform: `translateY(${RISE_PX * 2}px) scale(0.92)` },
        { opacity: 1, transform: 'none' },
      ],
      { ...FLY_IN, fill: 'backwards' },
    ),
  ];
}

export async function flyIn(stage: FlightStage, origin: CoverOrigin | null): Promise<Animation[]> {
  const [cover] = stage.slots;

  if (stage.reduced || !cover) return fadeChrome(stage, true);

  const animations = [
    ...fadeChrome(stage, true),
    ...(origin ? flyCover(cover, origin) : riseCover(cover)),
    ...riseFollowers(stage.slots),
  ];

  await finished(animations);

  return animations;
}

function landOn(slot: HTMLElement, origin: CoverOrigin): Animation[] {
  const { scale, from } = coverTransform(origin.rect, slot);

  return [
    slot.animate(
      [
        { transform: 'none', borderRadius: `${PAGE_RADIUS_PX}px`, boxShadow: SHADOW_REST },
        { transform: from, borderRadius: `${THUMB_RADIUS_PX / scale}px`, boxShadow: SHADOW_THUMB },
      ],
      { ...FLY_OUT, fill: 'forwards' },
    ),
  ];
}

function sink(slot: HTMLElement): Animation[] {
  return [
    slot.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: `translateY(${RISE_PX}px) scale(0.94)` },
      ],
      { duration: 260, easing: EASE_IN, fill: 'forwards' },
    ),
  ];
}

function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();

  return r.bottom > 0 && r.top < window.innerHeight;
}

function travelOf(stage: FlightStage, focus: HTMLElement | undefined, origin: CoverOrigin | null): Animation[] {
  if (!focus || stage.reduced) return [];

  return origin ? landOn(focus, origin) : sink(focus);
}

export async function flyOut(stage: FlightStage, focus: HTMLElement | undefined, origin: CoverOrigin | null) {
  const others = stage.slots.filter((s) => s !== focus && onScreen(s));
  const fades = others.map((s) =>
    s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: EASE_IN, fill: 'forwards' }),
  );
  const travel = travelOf(stage, focus, origin);

  await finished([...fadeChrome(stage, false), ...fades, ...travel]);
}

const degrees = (value: string) => Number.parseFloat(value) || 0;

export function findCover(): HTMLElement | null {
  const covers = [...document.querySelectorAll<HTMLElement>('[data-guide-cover]')];

  return covers.find((cover) => !cover.closest('[inert]') && cover.getBoundingClientRect().width > 0) ?? null;
}

export function readCoverOrigin(): CoverOrigin | null {
  const cover = findCover();
  const box = cover?.getBoundingClientRect();

  if (!cover || !box || box.bottom < 0 || box.top > window.innerHeight) return null;

  const lift = cover.matches(':hover') ? 1.1 : 1;
  const width = cover.offsetWidth * lift;
  const height = cover.offsetHeight * lift;
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;

  return {
    rect: new DOMRect(centerX - width / 2, centerY - height / 2, width, height),
    tiltX: degrees(cover.style.getPropertyValue('--rx')),
    tiltY: degrees(cover.style.getPropertyValue('--ry')),
  };
}
