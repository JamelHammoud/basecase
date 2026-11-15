import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Sketch } from '../../utils/sketch/types';
import { SketchEntities } from './SketchShapes';

const render = (sketch: Sketch, selected: string[] = []) =>
  renderToStaticMarkup(createElement(SketchEntities, { sketch, selected, view: { cx: 0, cy: 0, span: 100 } }));

describe('sketch entity drawing', () => {
  it('draws lines, arcs, circles and reference edges with their current selection', () => {
    const sketch: Sketch = {
      points: [
        { id: 'a', x: 10, y: 0 },
        { id: 'b', x: 0, y: 10 },
        { id: 'c', x: 0, y: 0, fixed: true },
      ],
      entities: [
        { id: 'line', kind: 'line', a: 'a', b: 'b' },
        { id: 'arc', kind: 'arc', c: 'c', a: 'a', b: 'b' },
        { id: 'circle', kind: 'circle', c: 'c', r: 3 },
        { id: 'ref', kind: 'line', a: 'a', b: 'c', ref: true },
      ],
      constraints: [],
    };
    const before = structuredClone(sketch);
    const html = render(sketch, ['line', 'a']);

    expect(html).toContain('d="M10 0 L0 -10" fill="none" stroke="#ffffff" stroke-width="2.5"');
    expect(html).toMatch(/d="M10 0 L9\.961[^"]+L[^ ]+ -10" fill="none"/);
    expect(html).toContain('d="M-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0"');
    expect(html).toContain('d="M10 0 L0 0" fill="none" stroke="#737373" stroke-width="2" stroke-dasharray="5 4"');
    expect(html).toContain('fill-rule="evenodd"');
    expect(html.match(/<circle /g)).toHaveLength(2);
    expect(html).toContain('cx="10" cy="0" r="0.8" fill="#0d99ff"');
    expect(sketch).toEqual(before);

    sketch.points[0].x = 20;
    expect(render(sketch)).toContain('d="M20 0 L0 -10"');
    expect(html).toContain('d="M10 0 L0 -10"');
  });

  it('keeps last duplicate coordinates and the origin fallback for missing points', () => {
    const sketch: Sketch = {
      points: [
        { id: 'a', x: 1, y: 2, fixed: true },
        { id: 'a', x: 3, y: 4, fixed: true },
      ],
      entities: [{ id: 'line', kind: 'line', a: 'a', b: 'missing' }],
      constraints: [],
    };

    expect(render(sketch)).toContain('d="M3 -4 L0 0"');
    expect(render({ points: [], entities: [], constraints: [] })).toBe('<g></g>');
  });

  it.each([300, 600])('bounds point-id reads across %i drawn circles', (count) => {
    let reads = 0;
    const sketch: Sketch = {
      points: Array.from({ length: count }, (_, i) => ({
        get id() {
          reads++;

          return `p${i}`;
        },
        x: i,
        y: 0,
        fixed: true,
      })),
      entities: Array.from({ length: count }, (_, i) => ({ id: `e${i}`, kind: 'circle', c: `p${i}`, r: 1 })),
      constraints: [],
    };
    const html = render(sketch);

    expect(html.match(/<path /g)).toHaveLength(count + 1);
    expect(reads).toBe(count * 2);
  });
});
