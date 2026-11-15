import { describe, expect, it } from 'vitest';
import { checkedRender } from './renderedCad';

const rendered = {
  ok: true,
  positions: [0, 0, 0, 10, 0, 0, 0, 10, 0],
  indices: [0, 1, 2],
  audit: {
    bodies: 1,
    nonManifoldEdges: 0,
    openEdges: 0,
    checks: [{ name: 'min wall', want: '2 mm', got: '1 mm', pass: false }],
  },
};

describe('compiled snapshot requirements', () => {
  it('refuses a mesh that breaks a saved design requirement', () => {
    expect(checkedRender(rendered, true)).toEqual({ ok: false, error: 'min wall needs 2 mm, got 1 mm' });
  });

  it('refuses an unaudited result when requirements were requested', () => {
    expect(checkedRender({ ...rendered, audit: { skipped: 'too many triangles' } }, true).ok).toBe(false);
    expect(checkedRender({ ...rendered, audit: undefined }, true).ok).toBe(false);
  });

  it('accepts measured requirements without making an ordinary render require an audit', () => {
    const passed = { ...rendered, audit: { ...rendered.audit, checks: [{ pass: true }] } };

    expect(checkedRender(passed, true).ok).toBe(true);
    expect(checkedRender({ ...rendered, audit: undefined }).ok).toBe(true);
  });
});
