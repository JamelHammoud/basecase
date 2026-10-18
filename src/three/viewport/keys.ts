import * as THREE from 'three';
import type { ViewportContext } from './viewportContext';

const typingInField = () =>
  document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;

export function installKeys(ctx: ViewportContext, applySnaps: () => void): () => void {
  const { orbit } = ctx.stage;
  const setShift = (held: boolean) => {
    if (ctx.runtime.shiftHeld === held) return;

    ctx.runtime.shiftHeld = held;
    applySnaps();
  };
  const setSpace = (pressed: boolean) => {
    ctx.ui.setSpacePressed(pressed);
    orbit.mouseButtons.LEFT = pressed ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Shift') setShift(true);

    if (e.code === 'Space' && !typingInField()) setSpace(true);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') setShift(false);

    if (e.code === 'Space') setSpace(false);
  };
  const onBlur = () => setShift(false);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
