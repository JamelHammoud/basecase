import type { Viewport3DHandle } from './Viewport3D';

interface ScreenPoint {
  x: number;
  y: number;
}

interface CursorState {
  target: [number, number, number] | null;
  visible: boolean;
  position: { current: ScreenPoint | null };
}

function cursorMotion(element: HTMLElement, position: CursorState['position']) {
  let frame = 0;
  let target: ScreenPoint | null = null;
  const step = () => {
    frame = 0;

    if (!target) return;

    const current = position.current ?? { x: target.x - 80, y: target.y + 60 };
    const settled = Math.abs(target.x - current.x) < 0.05 && Math.abs(target.y - current.y) < 0.05;

    current.x = settled ? target.x : current.x + (target.x - current.x) * 0.16;
    current.y = settled ? target.y : current.y + (target.y - current.y) * 0.16;
    position.current = current;
    element.style.transform = `translate3d(${current.x.toFixed(1)}px, ${current.y.toFixed(1)}px, 0)`;

    if (!settled) frame = requestAnimationFrame(step);
  };

  return {
    move: (point: ScreenPoint) => {
      target = point;

      if (!frame && (position.current?.x !== point.x || position.current?.y !== point.y)) step();
    },
    stop: () => cancelAnimationFrame(frame),
  };
}

export function watchCursor(
  viewport: Pick<Viewport3DHandle, 'projectPoints' | 'onRender'>,
  element: HTMLElement,
  { target, visible, position }: CursorState,
) {
  if (!visible || !target) return () => {};

  const motion = cursorMotion(element, position);
  const project = () => {
    const [point] = viewport.projectPoints([target]);

    if (point) motion.move(point);
  };
  const stop = viewport.onRender(project);

  project();

  return () => {
    stop();
    motion.stop();
  };
}
