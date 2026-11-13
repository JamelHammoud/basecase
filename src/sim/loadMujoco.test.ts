import { describe, expect, it } from 'vitest';
import { isLoadProgress } from './loadMujoco';

describe('MuJoCo load progress', () => {
  it("treats Emscripten's slow-load notice as progress, and everything else as an error", () => {
    expect(isLoadProgress('still waiting on run dependencies:')).toBe(true);
    expect(isLoadProgress('dependency: wasm-instantiate')).toBe(true);
    expect(isLoadProgress('(end of list)')).toBe(true);
    expect(isLoadProgress('Aborted(RuntimeError: unreachable)')).toBe(false);
    expect(isLoadProgress('XML Error: unknown element')).toBe(false);
  });
});
