import { describe, expect, it } from 'vitest';
import { checkedRenderRequest } from './cadRender.mjs';

describe('snapshot CAD requirements', () => {
  it('carries only supported finite requirements to the sandbox', () => {
    const requirements = {
      holes: [{ count: 4, d: 3.2, axis: 'z', through: true }],
      min_wall_mm: 2,
      flat_base: true,
      symmetric: ['x', 'y'],
      bodies: 1,
      genus: 4,
    };

    expect(checkedRenderRequest({ language: 'openscad', code: 'cube(1);', expect: requirements })).toEqual({
      language: 'openscad',
      code: 'cube(1);',
      expect: requirements,
    });
  });

  it('refuses hostile requirements before a kernel job can start', () => {
    const hostile = [
      null,
      [],
      'bodies=1; import("/secret");',
      { min_wall_mm: Infinity },
      { bodies: -1 },
      { holes: Array.from({ length: 65 }, () => ({ count: 1, d: 3 })) },
      { holes: [{ count: 1, d: 3, axis: 'z); import("/secret");' }] },
      { holes: [{ count: 1, d: NaN }] },
      { holes: [{ count: 1, d: 3, source: 'https://example.com' }] },
      { symmetric: ['process'] },
      { source: 'https://example.com' },
    ];

    for (const requirements of hostile) {
      expect(checkedRenderRequest({ language: 'openscad', code: 'cube(1);', expect: requirements })).toBeNull();
    }
  });
});
