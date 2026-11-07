import { useEffect, useEffectEvent, useState } from 'react';
import { isModalOpen } from '../design-system';
import { commandFromKeys, DRIVE_KEYS } from '../sim/driveKeys';
import type { SimDrive } from '../sim/useDrive';
import { isTextEntry } from './helpers';

const IDLE = { v: [0, 0, 0] as [number, number, number] };

const focusAway = () => isTextEntry(document.activeElement) || isModalOpen();

export function useDriveKeys(drive: SimDrive): { away: boolean } {
  const { active, cls } = drive;
  const [away, setAway] = useState(false);

  const release = useEffectEvent((held: Set<string>) => {
    held.clear();
    drive.setKeys(IDLE);
  });

  const onKey = useEffectEvent((e: KeyboardEvent, held: Set<string>) => {
    if (focusAway()) {
      release(held);
      setAway(true);

      return;
    }

    setAway(false);

    if (e.metaKey || e.ctrlKey) return;

    const key = e.key.toLowerCase();

    if (e.type === 'keydown' && key === 'r') drive.respawn();

    if (e.type === 'keydown' && key === 'escape') drive.stop();

    if (!DRIVE_KEYS.has(key) || !cls) return;

    e.preventDefault();

    if (e.type === 'keydown') held.add(key);
    else held.delete(key);

    drive.setKeys(commandFromKeys(held, cls));
  });

  useEffect(() => {
    if (!active) return;

    const held = new Set<string>();
    const key = (e: KeyboardEvent) => onKey(e, held);
    const blur = () => release(held);
    const focus = () => {
      const isAway = focusAway();

      setAway(isAway);

      if (isAway) release(held);
    };
    const hidden = () => {
      if (document.hidden) release(held);
    };
    const canvasPress = (e: PointerEvent) => {
      const onCanvas = e.target instanceof HTMLCanvasElement;

      if (onCanvas && isTextEntry(document.activeElement)) (document.activeElement as HTMLElement).blur();
    };

    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    window.addEventListener('blur', blur);
    window.addEventListener('pointerdown', canvasPress, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', focus);
    document.addEventListener('visibilitychange', hidden);
    focus();

    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerdown', canvasPress, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', focus);
      document.removeEventListener('visibilitychange', hidden);
      setAway(false);
    };
  }, [active]);

  return { away };
}
