import type { FrameSet, ImageClass } from './frameSet';
import { singular } from '../cases/trySearch/searchTerms';

const classKey = (name: string) => singular(name.trim().toLowerCase());

export function matchImageClasses(classes: ImageClass[], objects: Array<{ id: string; name: string }>): ImageClass[] {
  return classes.map((category) => {
    const unlinked = { ...category };

    delete unlinked.objectId;

    const matches = objects.filter((object) => classKey(object.name) === classKey(category.name));
    const match = matches.length === 1 ? matches[0] : null;

    return match ? { ...unlinked, name: match.name, objectId: match.id } : unlinked;
  });
}

export function linkFrameClasses(set: FrameSet, objects: Array<{ id: string; name: string }>): FrameSet {
  const categories = new Map<string, ImageClass>();
  const ids = new Map<number, number>();

  for (const category of matchImageClasses(set.classes, objects)) {
    const existing = categories.get(category.name);
    const keypoints = [...new Set([...(existing?.keypoints ?? []), ...(category.keypoints ?? [])])];
    const merged = { ...category, id: existing?.id ?? category.id, ...(keypoints.length ? { keypoints } : {}) };

    categories.set(category.name, merged);
    ids.set(category.id, merged.id);
  }

  return {
    ...set,
    classes: [...categories.values()],
    frames: set.frames.map((frame) => ({
      ...frame,
      annotations: frame.annotations.map((annotation) => ({ ...annotation, classId: ids.get(annotation.classId)! })),
    })),
  };
}
