import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchCursor } from './cursorMotion';

function setup() {
  const frames = new Map<number, FrameRequestCallback>();
  const listeners = new Set<() => void>();
  let nextFrame = 0;
  const request = vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);

    return nextFrame;
  });

  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));

  const projected = { x: 300, y: 200, visible: true };
  const viewport = {
    projectPoints: vi.fn(() => [{ ...projected }]),
    onRender: vi.fn((listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    }),
  };
  const element = { style: { transform: '' } } as HTMLElement;
  const position = { current: null as { x: number; y: number } | null };
  const target: [number, number, number] = [10, 20, 30];
  const render = () => listeners.forEach((listener) => listener());
  const settle = () => {
    for (let i = 0; i < 100 && frames.size; i++) {
      const pending = [...frames.values()];

      frames.clear();
      pending.forEach((callback) => callback(i * 16));
    }

    expect(frames.size).toBe(0);
  };

  return { frames, listeners, request, projected, viewport, element, position, target, render, settle };
}

describe('agent cursor projection', () => {
  let fixture: ReturnType<typeof setup>;

  beforeEach(() => {
    fixture = setup();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does no projection or animation work while hidden or without a target', () => {
    const { viewport, element, position, target, frames } = fixture;

    watchCursor(viewport, element, { position, target, visible: false })();
    watchCursor(viewport, element, { position, target: null, visible: true })();
    expect(viewport.onRender).not.toHaveBeenCalled();
    expect(viewport.projectPoints).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('projects once per render and animates only until it reaches the projected target', () => {
    const { viewport, element, position, target, settle, render, projected, request } = fixture;
    const stop = watchCursor(viewport, element, { position, target, visible: true });

    expect(position.current).toEqual({ x: 232.8, y: 250.4 });
    settle();
    expect(element.style.transform).toBe('translate3d(300.0px, 200.0px, 0)');
    expect(viewport.projectPoints).toHaveBeenCalledExactlyOnceWith([target]);

    const requests = request.mock.calls.length;

    render();
    expect(request).toHaveBeenCalledTimes(requests);
    projected.x = 500;
    projected.y = 100;
    render();
    settle();
    expect(element.style.transform).toBe('translate3d(500.0px, 100.0px, 0)');
    expect(viewport.projectPoints).toHaveBeenCalledTimes(3);
    stop();
  });

  it('cancels movement and render subscriptions when hidden or unmounted, then resumes at the last position', () => {
    const { viewport, element, position, target, frames, listeners, render, settle } = fixture;
    const stop = watchCursor(viewport, element, { position, target, visible: true });

    expect(frames.size).toBe(1);
    stop();
    expect(frames.size).toBe(0);
    expect(listeners.size).toBe(0);
    render();
    expect(viewport.projectPoints).toHaveBeenCalledTimes(1);

    const resume = watchCursor(viewport, element, { position, target, visible: true });

    settle();
    expect(position.current).toEqual({ x: 300, y: 200 });
    resume();
  });
});
