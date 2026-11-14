import { describe, expect, it } from 'vitest';
import { isLoadProgress } from './loadMujoco';

const APP_SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.{test,perf.test}.{ts,tsx}'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

const OWN_LOAD = /import\s+(?!type\b)\w+[^;]*from\s+'@mujoco\/mujoco'/;

describe('MuJoCo load progress', () => {
  it("treats Emscripten's slow-load notice as progress, and everything else as an error", () => {
    expect(isLoadProgress('still waiting on run dependencies:')).toBe(true);
    expect(isLoadProgress('dependency: wasm-instantiate')).toBe(true);
    expect(isLoadProgress('(end of list)')).toBe(true);
    expect(isLoadProgress('Aborted(RuntimeError: unreachable)')).toBe(false);
    expect(isLoadProgress('XML Error: unknown element')).toBe(false);
  });

  it('loads MuJoCo through loadMujoco everywhere in the app, so no worker logs the notice as an error', () => {
    expect(OWN_LOAD.test("import loadMujoco, { type MainModule } from '@mujoco/mujoco';")).toBe(true);
    expect(OWN_LOAD.test("import type { MainModule } from '@mujoco/mujoco';")).toBe(false);
    expect(
      Object.entries(APP_SOURCES)
        .filter(([file, source]) => file !== './loadMujoco.ts' && OWN_LOAD.test(source))
        .map(([file]) => file),
    ).toEqual([]);
  });
});
