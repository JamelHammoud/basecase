import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TracePlot } from './TracePlot';
import { sampleAt, tracePaths, traceRange, xRange, type Trace } from './tracePaths';

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

  it('widens the range to take in a limit line', () => {
    expect(traceRange([trace('a', [0, 1])], [4])).toEqual([0, 4]);
  });

  it('draws a long trace one low and one high point per column, keeping the spike', () => {
    const values = Array.from({ length: 30000 }, (_, i) => (i === 12345 ? 50 : Math.sin(i / 100)));
    const [only] = tracePaths([trace('a', values)], BOX);
    const points = only.d.split(/[ML]/).filter(Boolean);
    const ys = points.map((p) => Number(p.split(' ')[1]));

    expect(points.length).toBeLessThanOrEqual(2 * BOX.width);
    expect(Math.min(...ys)).toBeCloseTo(BOX.inset, 5);
  });

  it('maps a fraction of the width to the nearest sample', () => {
    expect(sampleAt(0, 151)).toBe(0);
    expect(sampleAt(0.5, 151)).toBe(75);
    expect(sampleAt(1.4, 151)).toBe(150);
    expect(sampleAt(-1, 151)).toBe(0);
  });

  it('places a trace with x values by value on a shared x range, and draws points as dots', () => {
    const dots: Trace = { id: 'walk', values: [0, 2], x: [0, 10], tone: 'primary', points: true };
    const line: Trace = { id: 'servo', values: [4, 0], x: [0, 20], tone: 'accent' };
    const xs = xRange([dots, line]);
    const [walk, servo] = tracePaths([dots, line], BOX, traceRange([dots, line]), xs);

    expect(xs).toEqual([0, 20]);
    expect(walk.d).toBe('M0.0 45.0h0M50.0 25.0h0');
    expect(walk.points).toBe(true);
    expect(servo.d).toBe('M0.0 5.0L100.0 45.0');
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

  it('draws the playhead, the limit and the markers over the traces', () => {
    const html = renderToStaticMarkup(
      createElement(TracePlot, {
        traces: [trace('effort', [0, 1, 2, 1, 0], 'primary')],
        height: 50,
        playhead: 2,
        limit: 4,
        markers: [1, 3],
      }),
    );

    expect(html).toContain('data-testid="trace-playhead" d="M500.0 0V50"');
    expect(html).toContain('data-testid="trace-limit" d="M0 8.0H1000"');
    expect(html.match(/data-testid="trace-marker"/g)).toHaveLength(2);
    expect(html.match(/#f87171/g)).toHaveLength(2);
  });

  it('draws points with round dots from zero, and labels the top of each axis with its unit', () => {
    const html = renderToStaticMarkup(
      createElement(TracePlot, {
        traces: [{ id: 'walk', values: [1, 1.5], x: [20, 40], tone: 'primary', points: true }],
        height: 50,
        fromZero: true,
        units: { x: 'rpm', y: 'N·m' },
      }),
    );

    expect(html).toContain('data-testid="trace-walk"');
    expect(html).toContain('stroke-linecap="round"');
    expect(html).toContain('stroke-width="4"');
    expect(html).toContain('1.5 N·m');
    expect(html).toContain('40 rpm');
  });

  it('draws nothing while loading', () => {
    const html = renderToStaticMarkup(createElement(TracePlot, { traces: [trace('a', [0, 1])], loading: true }));

    expect(html).toContain('shimmer');
    expect(html).not.toContain('<path');
  });
});
