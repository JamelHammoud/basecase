import { useRef, useState } from 'react';
import type { Vec3 } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';

const TRACKPAD_TAP_GRACE_MS = 400;
const MENU_MOVE_TOLERANCE = 5;

export interface CanvasMenuState {
  x: number;
  y: number;
  partId: string | null;
  point: Vec3 | null;
}

interface MenuPress {
  x: number;
  y: number;
  pending: boolean;
  moved: boolean;
  released: boolean;
}

const isMenuPress = (e: React.PointerEvent) => e.button === 2 || (e.button === 0 && e.ctrlKey);

const movedFrom = (press: MenuPress, e: { clientX: number; clientY: number }) =>
  Math.hypot(e.clientX - press.x, e.clientY - press.y) > MENU_MOVE_TOLERANCE;

export function useCanvasMenu({ viewportRef, selectedIds, selection }: WorkspaceCore, stopFollowing: () => void) {
  const { select } = selection;
  const [menu, setMenu] = useState<CanvasMenuState | null>(null);
  const pressRef = useRef<MenuPress | null>(null);
  const lastWheelRef = useRef(-Infinity);

  const openMenu = (x: number, y: number, partId: string | null, point: Vec3 | null) => {
    if (partId && !selectedIds.includes(partId)) select(partId);

    setMenu({ x, y, partId, point });
  };

  const openAt = (x: number, y: number, timeStamp: number) => {
    if (timeStamp - lastWheelRef.current < TRACKPAD_TAP_GRACE_MS) return;

    const hit = viewportRef.current?.pickAt(x, y) ?? null;

    openMenu(x, y, hit?.partId ?? null, hit?.point ?? null);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();

    if ((e.target as HTMLElement).closest('button, [role=menu], textarea, input')) return;

    const press = pressRef.current;

    if (press && !press.released) {
      press.pending = true;

      return;
    }

    pressRef.current = null;

    if (press?.moved) return;

    openAt(e.clientX, e.clientY, e.timeStamp);
  };

  const onPointerUpCapture = (e: React.PointerEvent) => {
    const press = pressRef.current;

    if (!press) return;

    press.released = true;
    press.moved = press.moved || movedFrom(press, e);

    if (!press.pending) return;

    pressRef.current = null;

    if (!press.moved) openAt(press.x, press.y, e.timeStamp);
  };

  const pointerHandlers = {
    onPointerDownCapture: (e: React.PointerEvent) => {
      pressRef.current = isMenuPress(e)
        ? { x: e.clientX, y: e.clientY, pending: false, moved: false, released: false }
        : null;
      stopFollowing();
    },
    onWheelCapture: (e: React.WheelEvent) => {
      stopFollowing();
      lastWheelRef.current = e.timeStamp;
    },
    onContextMenu,
    onPointerUpCapture,
    onPointerMoveCapture: (e: React.PointerEvent) => {
      const press = pressRef.current;

      if (press && !press.released && movedFrom(press, e)) press.moved = true;
    },
    onPointerCancelCapture: () => {
      pressRef.current = null;
    },
  };

  return { menu, closeMenu: () => setMenu(null), openMenu, pointerHandlers };
}

export type CanvasMenu = ReturnType<typeof useCanvasMenu>;
