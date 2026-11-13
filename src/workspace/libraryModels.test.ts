import { describe, expect, it } from 'vitest';
import type { CustomModelDefinition } from '../types/robotics';
import { withModel } from './libraryModels';

const model = (id: string, createdAt: string, name = id) => ({ id, name, createdAt }) as CustomModelDefinition;

describe('withModel', () => {
  const library = [model('b', '2026-11-02'), model('a', '2026-11-01')];

  it('keeps a renamed model in its place, newest first', () => {
    expect(withModel(library, model('a', '2026-11-01', 'Base plate')).map((m) => m.name)).toEqual(['b', 'Base plate']);
  });

  it('puts a duplicate first and a restored model back where it was', () => {
    expect(withModel(library, model('c', '2026-11-03')).map((m) => m.id)).toEqual(['c', 'b', 'a']);
    expect(withModel([library[0]], library[1]).map((m) => m.id)).toEqual(['b', 'a']);
  });
});
