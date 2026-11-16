import { expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => new Map());

vi.mock('./store.mjs', () => ({
  store: () => ({ get: (key) => saved.get(key) ?? {}, save: (key, value) => saved.set(key, value) }),
}));

import { rememberDiagnostic, windowsDiagnosticsReady } from './diagnosticReadiness.mjs';

it('enables Windows execution only after verified Windows evidence and retains its provenance', () => {
  const result = {
    selection: { platform: 'windows', revision: 'a'.repeat(40) },
    url: 'https://github.com/o/r/actions/runs/42',
    runId: 42,
  };

  expect(windowsDiagnosticsReady()).toBe(false);
  rememberDiagnostic(result);
  rememberDiagnostic({ ...result, verified: true, selection: { ...result.selection, platform: 'linux' } });
  expect(windowsDiagnosticsReady()).toBe(false);

  rememberDiagnostic({ ...result, verified: true });

  expect(windowsDiagnosticsReady()).toBe(true);
  expect(saved.get('windows')).toEqual({
    version: 1,
    revision: result.selection.revision,
    url: result.url,
    runId: 42,
    verifiedAt: expect.any(Number),
  });
});
