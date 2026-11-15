import type { ImageClass } from '../frameSet';
import { name, number, refuseImage } from './sourceFiles';

export function sourceClasses(classes: ImageClass[]) {
  const byId = new Map<number, ImageClass>();
  const byName = new Map<string, ImageClass>();
  const index = (category: ImageClass) => {
    const { id, name } = category;

    if (!byId.has(id)) byId.set(id, category);

    if (!byName.has(name)) byName.set(name, category);
  };

  for (const category of classes) index(category);

  const add = (category: ImageClass): ImageClass => {
    if (classes.length >= 1000) return refuseImage();

    classes.push(category);
    index(category);

    return category;
  };
  const named = (label: string): ImageClass => byName.get(label) ?? add({ id: classes.length, name: label });
  const inferred = (value: unknown): ImageClass => {
    if (typeof value === 'string') return named(name(value));

    const id = number(value);

    if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) refuseImage();

    return byId.get(id) ?? add({ id, name: `class-${id}` });
  };

  return { get: (id: number) => byId.get(id), named, inferred };
}
