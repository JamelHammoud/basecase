import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TracePlot } from './TracePlot';
import { tracePaths, traceRange, type Trace } from './tracePaths';

const BOX = { width: 100, height: 50, inset: 5 };

const trace = (id: string, values: number[], tone: Trace['tone'] = 'muted'): Trace => ({ id, values, tone });

describe('tracePaths', () => {
  it('draws every trace on one shared range, so the traces line up', () => {
    const [low, high] = tracePaths([trace('a', [0, 1]), trace('b', [0, 2])], BOX);

    expect(low.d).toBe('M0.0 45.0L100.0 25.0');
    expect(high.d).toBe('M0.0 45.0L100.0 5.0');
  });

  it('lifts the pen over missing samples instead of drawing to zero', () => {
    const [only] = tracePaths([trace('a', [0, Number.NaN, 2, 1])], BOX);

    expect(only.d.match(/M/g)).toHaveLength(2);
    expect(only.d).not.toContain('NaN');
  });

  it('gives a flat or empty trace a range around its value', () => {
    const [low, high] = traceRange([trace('a', [3, 3])]);

    expect(low).toBeCloseTo(2.7, 9);
    expect(high).toBeCloseTo(3.3, 9);
    expect(traceRange([trace('a', [])])).toEqual([-1, 1]);
  });
});

describe('TracePlot', () => {
  it('renders one path per trace with a test id, the accent only on the accent trace', () => {
    const html = renderToStaticMarkup(
      createElement(TracePlot, {
        traces: [trace('logged', [0, 1], 'primary'), trace('preset', [0, 2]), trace('calibration', [0, 1], 'accent')],
      }),
    );

    expect(html.match(/<path /g)).toHaveLength(3);
    expect(html).toContain('data-testid="trace-logged"');
    expect(html).toContain('data-testid="trace-preset"');
    expect(html.match(/#0d99ff/g)).toHaveLength(1);
    expect(html).not.toMatch(/<text/);
  });

  it('draws nothing while loading', () => {
    const html = renderToStaticMarkup(createElement(TracePlot, { traces: [trace('a', [0, 1])], loading: true }));

    expect(html).toContain('shimmer');
    expect(html).not.toContain('<path');
  });
});
