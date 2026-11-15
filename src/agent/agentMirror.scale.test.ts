import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { mirrorParts } from './agentMirror';
import { specToPart } from './agentScene';

const part = (id: string): ScenePart => specToPart({ id, shape: 'box', position: [30, 20, 10] });

describe('mirror source and twin lookup', () => {
  it.each(['x', 'y', 'z'] as const)('keeps first matches, request order and rename priority on %s', (axis) => {
    const source = part('source');
    const first: ScenePart = { ...part('first'), mirrorOf: { id: source.id, axis } };
    const later: ScenePart = { ...part('later'), mirrorOf: first.mirrorOf };
    const otherAxis: ScenePart = {
      ...part('other-axis'),
      mirrorOf: { id: source.id, axis: axis === 'x' ? 'y' : 'x' },
    };
    const scene = [
      otherAxis,
      first,
      source,
      later,
      { ...source, position: [999, 999, 999] as [number, number, number] },
    ];
    const copies = mirrorParts(scene, ['missing', source.id, source.id, 'first'], axis, {});

    expect(copies.map((copy) => copy.id)).toEqual([
      'first-mirror',
      'first-mirror-mirror',
      'first-mirror-mirror-mirror',
    ]);
    expect(copies.slice(0, 2).map((copy) => copy.mirrorOf)).toEqual([
      { id: source.id, axis },
      { id: source.id, axis },
    ]);
    expect(copies[0].position.map(Math.abs)).toEqual(source.position.map(Math.abs));
    expect(mirrorParts(scene, [source.id], axis, {}).map((copy) => copy.id)).toEqual(['first']);
    expect(mirrorParts(scene, [source.id], axis, { source: 'chosen' }).map((copy) => copy.id)).toEqual(['chosen']);
    expect(mirrorParts(scene, [], axis, {})).toEqual([]);
  });

  it.each([false, true])('looks up 600 sources with existing twins=%s in linear work', (existing) => {
    const size = 600;
    const sources = Array.from({ length: size }, (_, i) => part(`source-${i}`));
    const twins: ScenePart[] = existing
      ? sources.map((source, i) => ({ ...part(`twin-${i}`), mirrorOf: { id: source.id, axis: 'x' } }))
      : [];
    let reads = 0;
    const scene = new Proxy([...sources, ...twins.reverse()], {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/u.test(key)) reads++;

        return Reflect.get(target, key, receiver);
      },
    });
    const copies = mirrorParts(scene, sources.map((source) => source.id).reverse(), 'x', {});

    expect(copies.map((copy) => copy.id)).toEqual(
      sources.map((source, i) => (existing ? `twin-${i}` : `${source.id}-mirror`)).reverse(),
    );
    expect(copies.map((copy) => copy.mirrorOf?.id)).toEqual(sources.map((source) => source.id).reverse());
    expect(reads).toBeLessThan(scene.length * 4);
  });
});
