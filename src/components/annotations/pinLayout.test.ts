import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_KEY, watchPinLayout, type LayoutState } from './pinLayout';

const element = (width = 900, height = 700) =>
  ({ style: {}, clientWidth: width, clientHeight: height, offsetHeight: 180 }) as HTMLElement;

function setup() {
  const listeners = new Set<() => void>();
  const observers: Array<{
    resize: () => void;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();

      constructor(resize: () => void) {
        observers.push({ resize, observe: this.observe, disconnect: this.disconnect });
      }
    },
  );

  const requestFrame = vi.fn();

  vi.stubGlobal('requestAnimationFrame', requestFrame);

  const projected = [{ x: 400.2, y: 450.8, visible: true }];
  const viewport = {
    projectPoints: vi.fn(() => projected),
    onRender: vi.fn((listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    }),
  };
  const pin = element();
  const nodes = { layer: element(), card: element(), pins: new Map([['note', pin]]) };
  const state: LayoutState = {
    shown: [{ id: 'note', partId: null, position: [10, 20, 30], comments: [], createdAt: '2026-11-14T00:00:00Z' }],
    parts: [],
    draft: null,
    activeId: 'note',
  };
  const render = () => listeners.forEach((listener) => listener());

  return { observers, requestFrame, viewport, projected, nodes, pin, state, listeners, render };
}

afterEach(() => vi.unstubAllGlobals());

describe('comment pin projection', () => {
  it('does no work for an empty layer', () => {
    const { viewport, nodes, state, observers, requestFrame } = setup();

    watchPinLayout(viewport, { ...state, shown: [] }, nodes)();
    expect(viewport.onRender).not.toHaveBeenCalled();
    expect(viewport.projectPoints).not.toHaveBeenCalled();
    expect(observers).toEqual([]);
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('lays out pins immediately and after rendering, without its own animation loop', () => {
    const { viewport, nodes, state, pin, projected, render, requestFrame } = setup();
    const stop = watchPinLayout(viewport, state, nodes);

    expect(viewport.projectPoints).toHaveBeenCalledExactlyOnceWith([[10, 20, 30]]);
    expect(pin.style.transform).toBe('translate3d(400px, 451px, 0)');
    expect(pin.style.visibility).toBe('visible');
    expect(nodes.card.style.transform).toBe('translate3d(442px, 411px, 0)');

    projected[0] = { x: 800, y: 200, visible: false };
    render();
    expect(pin.style.transform).toBe('translate3d(800px, 200px, 0)');
    expect(pin.style.visibility).toBe('hidden');
    expect(nodes.card.style.transform).toBe('translate3d(468px, 160px, 0)');
    expect(viewport.projectPoints).toHaveBeenCalledTimes(2);
    expect(requestFrame).not.toHaveBeenCalled();
    stop();
  });

  it('reflows the card after a reply or a panel resize and disconnects all listeners', () => {
    const { viewport, nodes, state, observers, listeners, render } = setup();
    const stop = watchPinLayout(viewport, state, nodes);
    const observer = observers[0];

    expect(observer.observe.mock.calls).toEqual([[nodes.layer], [nodes.card]]);
    Object.defineProperty(nodes.card, 'offsetHeight', { value: 350 });
    observer.resize();
    expect(nodes.card.style.transform).toBe('translate3d(442px, 254px, 0)');
    Object.defineProperty(nodes.layer, 'clientWidth', { value: 650 });
    observer.resize();
    expect(nodes.card.style.transform).toBe('translate3d(68px, 254px, 0)');
    stop();
    expect(listeners.size).toBe(0);
    expect(observer.disconnect).toHaveBeenCalledOnce();
    render();
    expect(viewport.projectPoints).toHaveBeenCalledTimes(3);
  });

  it('anchors a draft without saved comments', () => {
    const { viewport, nodes, state, pin } = setup();

    nodes.pins = new Map([[DRAFT_KEY, pin]]);

    const stop = watchPinLayout(viewport, { ...state, shown: [], draft: { position: [4, 5, 6] } }, nodes);

    expect(viewport.projectPoints).toHaveBeenCalledExactlyOnceWith([[4, 5, 6]]);
    expect(pin.style.visibility).toBe('visible');
    expect(nodes.card.style.visibility).toBe('visible');
    stop();
  });
});
