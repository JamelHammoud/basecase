import { describe, expect, it } from 'vitest';
import { arcPoints, sketchLoops } from './profile';
import type { Sketch, Vec2 } from './types';

function sampledArc(center: Vec2, from: Vec2, to: Vec2): Vec2[] {
  const radius = Math.hypot(from[0] - center[0], from[1] - center[1]);
  const start = Math.atan2(from[1] - center[1], from[0] - center[0]);
  const end = Math.atan2(to[1] - center[1], to[0] - center[0]);
  const tau = Math.PI * 2;
  const wrapped = (((end - start) % tau) + tau) % tau;
  const sweep = wrapped === 0 ? tau : wrapped;
  const steps = Math.max(4, Math.ceil(sweep / (Math.PI / 36)));

  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = start + (sweep * i) / steps;

    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
  });
}

function arcSketch(center: Vec2, from: Vec2, to: Vec2, reverse: boolean): Sketch {
  const arc = { id: 'arc', kind: 'arc' as const, c: 'center', a: 'from', b: 'to' };
  const line = { id: 'line', kind: 'line' as const, a: 'from', b: 'to' };

  return {
    points: [
      { id: 'center', x: center[0], y: center[1] },
      { id: 'from', x: from[0], y: from[1] },
      { id: 'to', x: to[0], y: to[1] },
    ],
    entities: reverse ? [line, arc] : [arc, line],
    constraints: [],
  };
}

describe('Sketch arc sampling', () => {
  it.each([false, true])('preserves complete contours with reversed traversal %s', (reverse) => {
    for (let i = 0; i < 150; i++) {
      const center: Vec2 = [i - 75, i % 7];
      const radius = i % 13;
      const start = i * 0.37;
      const end = i % 10 === 0 ? start : start + (i % 17) * 0.03;
      const from: Vec2 = [center[0] + radius * Math.cos(start), center[1] + radius * Math.sin(start)];
      const to: Vec2 = [center[0] + radius * Math.cos(end), center[1] + radius * Math.sin(end)];
      const samples = sampledArc(center, from, to);
      const sketch = arcSketch(center, from, to, reverse);
      const before = structuredClone(sketch);
      const expected = reverse ? [from, ...samples.toReversed().slice(0, -1)] : [...samples.slice(0, -1), to];

      expect(arcPoints(center, from, to)).toEqual(samples);
      expect(sketchLoops(sketch)).toEqual([expected]);
      expect(sketch).toEqual(before);

      sketch.points[0].x += 0.25;

      const edited = sampledArc([center[0] + 0.25, center[1]], from, to);
      const changed = reverse ? [from, ...edited.toReversed().slice(0, -1)] : [...edited.slice(0, -1), to];

      expect(sketchLoops(sketch)).toEqual([changed]);
      expect(sketchLoops(before)).toEqual([expected]);
    }
  });
});
