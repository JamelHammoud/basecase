import type React from 'react';

const TILT_DEG = 16;
const SHADOW_PX = 10;
const TILT_VARS = ['--rx', '--ry', '--gx', '--gy', '--sx', '--sy'];

export function tiltToward(e: React.PointerEvent<HTMLElement>) {
  const card = e.currentTarget;
  const box = card.getBoundingClientRect();
  const x = (e.clientX - box.left) / box.width;
  const y = (e.clientY - box.top) / box.height;

  card.style.setProperty('--rx', `${(0.5 - y) * TILT_DEG}deg`);
  card.style.setProperty('--ry', `${(x - 0.5) * TILT_DEG}deg`);
  card.style.setProperty('--gx', `${x * 100}%`);
  card.style.setProperty('--gy', `${y * 100}%`);
  card.style.setProperty('--sx', `${(0.5 - x) * SHADOW_PX}px`);
  card.style.setProperty('--sy', `${(0.5 - y) * SHADOW_PX + SHADOW_PX}px`);
}

export function settleTilt(card: HTMLElement) {
  TILT_VARS.forEach((name) => card.style.removeProperty(name));
}
