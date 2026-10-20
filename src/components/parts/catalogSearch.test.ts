import { describe, expect, it } from 'vitest';
import { parseSizeQuery, searchCatalog } from './catalogSearch';
import { CATEGORIES, searchScope } from './partsViews';

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

  it('makes motion hardware from catalog sizes', () => {
    const rails = searchCatalog('mgn12 rail 245');
    const extrusion = searchCatalog('2020 extrusion 300');

    expect(rails[0].hardware).toMatchObject({ type: 'linear_rail', size: 'MGN12', length: 245 });
    expect(rails[0].name).toBe('MGN12 × 245 Linear Rail');
    expect(extrusion[0].hardware).toMatchObject({ type: 'extrusion', size: '2020', length: 300 });
    expect(searchCatalog('lm8uu')[0].hardware?.type).toBe('linear_bearing');
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
    const scope = searchScope({ kind: 'category', id: 'Servos' })!;

    expect(scope.label).toBe('servos');
    expect(servos.items.every(scope.has)).toBe(true);
    expect(searchScope({ kind: 'home' })).toBeNull();
  });
});
