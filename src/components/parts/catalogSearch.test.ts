import { describe, expect, it } from 'vitest';
import { parseSizeQuery, searchCatalog } from './catalogSearch';
import { CATEGORIES, sceneParts, searchScope } from './partsViews';

describe('parts search', () => {
  it('reads metric sizes, lengths and bearing numbers', () => {
    expect(parseSizeQuery('M3x12 button')).toEqual({ size: 'M3', length: 12, words: ['button'] });
    expect(parseSizeQuery('M2.5 standoff 12')).toEqual({ size: 'M2.5', length: 12, words: ['standoff'] });
    expect(parseSizeQuery('608 bearing')).toEqual({ size: '608', length: undefined, words: ['bearing'] });
    expect(parseSizeQuery('servo')).toEqual({ size: undefined, length: undefined, words: ['servo'] });
  });

  it('makes exact hardware for a sized query', () => {
    const results = searchCatalog('m3x12');

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((i) => i.hardware?.size === 'M3')).toBe(true);
    expect(results.every((i) => i.hardware?.length === 12)).toBe(true);
  });

  it('ranks the group a word names first', () => {
    const results = searchCatalog('servo');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].componentId).toBeTruthy();
    expect(searchCatalog('   ')).toEqual([]);
  });
});

describe('parts views', () => {
  it('scopes search to the open category', () => {
    const servos = CATEGORIES.find((c) => c.id === 'Servos')!;
    const scope = searchScope({ kind: 'category', id: 'Servos' }, { used: [], related: [] })!;

    expect(scope.label).toBe('servos');
    expect(servos.items.every(scope.has)).toBe(true);
    expect(searchScope({ kind: 'home' }, { used: [], related: [] })).toBeNull();
  });

  it('counts catalog parts in the scene and suggests what goes with them', () => {
    const servo = CATEGORIES.find((c) => c.id === 'Servos')!.items[0];
    const part = { componentId: servo.componentId } as Parameters<typeof sceneParts>[0][number];
    const scene = sceneParts([part, part], '');

    expect(scene.used).toEqual([{ item: expect.objectContaining({ componentId: servo.componentId }), count: 2 }]);
    expect(scene.related.some((i) => i.componentId === servo.componentId)).toBe(false);
  });
});
