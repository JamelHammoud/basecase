import { expect, it, vi } from 'vitest';
import { listenForPaletteEscape } from './paletteKeys';

const key = (name: string) => Object.assign(new Event('keydown', { cancelable: true }), { key: name });

it('owns Escape independently of focus and releases keyboard ownership when the palette closes', () => {
  const target = new EventTarget();
  const close = vi.fn();
  const workspace = vi.fn();
  const release = listenForPaletteEscape(target as unknown as Window, close);

  target.addEventListener('keydown', workspace);

  const escape = key('Escape');

  target.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  expect(workspace).not.toHaveBeenCalled();

  const enter = key('Enter');

  target.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(false);
  expect(workspace).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  release();
  target.dispatchEvent(key('Escape'));
  expect(workspace).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledOnce();
});
