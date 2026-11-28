import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { snapBracket } from './fixtures/snapBracket';
import { portsAt, snapTargets } from './snap';

const base = snapBracket();
const mate = (target: string) => ({ port: 'horn', target, targetPort: 'horn', type: 'fastened' as const });
const part = (id: string, target?: string): ScenePart => ({
  ...base,
  id,
  mates: target ? [mate(target)] : undefined,
});

describe('snap target dependencies', () => {
  it('excludes reverse chains and branches through hidden parts while preserving target order', () => {
    const first = part('first');
    const last = part('last');
    const hidden = { ...part('hidden', 'root'), visible: false };
    const parts = [part('leaf', 'middle'), first, part('branch', 'hidden'), part('middle', 'hidden'), hidden, last];
    const original = structuredClone(parts);

    expect(snapTargets(parts, 'root')).toEqual([...portsAt(first), ...portsAt(last)]);
    expect(parts).toEqual(original);
  });

  it('terminates on cycles and follows only the last mate', () => {
    const independent = { ...part('independent'), mates: [mate('root'), mate('missing')] };
    const parts = [part('child', 'root'), independent, part('root', 'child'), part('self', 'self')];

    expect(snapTargets(parts, 'root')).toEqual([...portsAt(independent), ...portsAt(parts[3])]);
    expect(snapTargets(parts, 'self')).toEqual(parts.slice(0, 3).flatMap(portsAt));
    expect(snapTargets([], 'missing')).toEqual([]);
  });

  it('reads each dependency once regardless of reverse-chain depth and observes later edits', () => {
    let reads = 0;
    const parts = Array.from({ length: 128 }, (_, i) => {
      const source = part(`link-${i}`, i ? `link-${i - 1}` : 'root');

      return {
        ...source,
        get mates() {
          reads++;

          return source.mates;
        },
      };
    }).reverse();

    expect(snapTargets(parts, 'root')).toEqual([]);
    expect(reads).toBe(parts.length);

    const detached = { ...parts.at(-1)!, mates: undefined };
    const changed = [...parts.slice(0, -1), detached];

    expect(snapTargets(changed, 'root')).toEqual(changed.flatMap(portsAt));
  });
});
