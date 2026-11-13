import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TracePlot } from './TracePlot';
import { spanOf, TRACE_COLORS, tracePath } from './tracePlotMath';

const frame = { x: [0, 2] as [number, number], y: [0, 1] as [number, number], width: 100, height: 50 };

describe('TracePlot', () => {
  it('draws every trace on one time axis, the accent on top', () => {
    const html = renderToStaticMarkup(
      createElement(TracePlot, {
        times: [0, 1, 2],
        traces: [
          { id: 'calibrated', values: [0, 0.4, 0.9], tone: 'accent' },
          { id: 'logged', values: [0, 0.5, 1], tone: 'strong' },
          { id: 'preset', values: [0, 0.2, 0.6], tone: 'muted' },
        ],
      }),
    );
    const order = ['preset', 'logged', 'calibrated'].map((id) => html.indexOf(`data-testid="trace-${id}"`));

    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain(`stroke="${TRACE_COLORS.accent}"`);
    expect(html).not.toMatch(/<text/);
  });

  it('scales values into the frame, flips y and breaks the line at missing samples', () => {
    expect(tracePath([0, 1, 2], [0, 1, 0.5], frame)).toBe('M0 50L50 0L100 25');
    expect(tracePath([0, 1, 2, 3], [0, Number.NaN, 1, 1], { ...frame, x: [0, 3] })).toBe('M0 50M66.7 0L100 0');
  });

  it('fits the range of every trace with a little headroom, and survives flat or empty traces', () => {
    const [lo, hi] = spanOf([
      [0, 1],
      [-1, 0.5],
    ]);

    expect(lo).toBeLessThan(-1);
    expect(hi).toBeGreaterThan(1);
    expect(spanOf([[2, 2]])).toEqual([1, 3]);
    expect(spanOf([[]])).toEqual([0, 1]);
  });
});
