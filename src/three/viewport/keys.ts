import * as THREE from 'three';
import type { ViewportContext } from './viewportContext';

const typingInField = () =>
  document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;

const MODIFIERS: Record<string, 'shiftHeld' | 'altHeld'> = { Shift: 'shiftHeld', Alt: 'altHeld' };

export function installKeys(ctx: ViewportContext, onModifiers: () => void): () => void {
  const { orbit } = ctx.stage;
  const setHeld = (key: string, held: boolean) => {
    const flag = Object.hasOwn(MODIFIERS, key) ? MODIFIERS[key] : null;

    if (!flag || ctx.runtime[flag] === held) return;

    ctx.runtime[flag] = held;
    onModifiers();
  };
  const setSpace = (pressed: boolean) => {
    ctx.ui.setSpacePressed(pressed);
    orbit.mouseButtons.LEFT = pressed ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    setHeld(e.key, true);

    if (e.code === 'Space' && !typingInField()) setSpace(true);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    setHeld(e.key, false);

    if (e.code === 'Space') setSpace(false);
  };
  const onBlur = () => Object.keys(MODIFIERS).forEach((key) => setHeld(key, false));

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
