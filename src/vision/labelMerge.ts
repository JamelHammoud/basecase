import type { FrameSet, ImageClass, TrainingFrame } from './frameSet';

export interface FrameLabelState {
  classes: FrameSet['classes'];
  frames: Pick<TrainingFrame, 'id' | 'annotations'>[];
}

function mergeEntries<T>(previous: T[], next: T[], stored: T[], key: (entry: T) => string | number): T[] {
  const before = new Map(previous.map((entry) => [key(entry), entry]));
  const after = new Map(next.map((entry) => [key(entry), entry]));
  const current = new Map(stored.map((entry) => [key(entry), entry]));
  const retained = next.flatMap((entry) => {
    if (before.get(key(entry)) !== entry) return [entry];

    const saved = current.get(key(entry));

    return saved === undefined ? [] : [saved];
  });

  return [...retained, ...stored.filter((entry) => !before.has(key(entry)) && !after.has(key(entry)))];
}

function mergeClasses(previous: ImageClass[], next: ImageClass[], stored: ImageClass[]): ImageClass[] {
  const before = new Map(previous.map((entry) => [entry.id, entry]));
  const current = new Map(stored.map((entry) => [entry.id, entry]));
  const edits = next.map((category) => {
    const original = before.get(category.id);
    const saved = current.get(category.id);

    if (!original || !saved || original === category) return category;

    return {
      ...saved,
      ...(original.name !== category.name ? { name: category.name } : {}),
      ...(original.keypoints !== category.keypoints ? { keypoints: category.keypoints } : {}),
      ...(original.objectId !== category.objectId ? { objectId: category.objectId } : {}),
    };
  });

  return mergeEntries(previous, edits, stored, (entry) => entry.id);
}

function mergeLabelChanges(previous: FrameLabelState, next: FrameLabelState, stored: FrameLabelState): FrameLabelState {
  const before = new Map(previous.frames.map((frame) => [frame.id, frame]));
  const after = new Map(next.frames.map((frame) => [frame.id, frame]));

  return {
    ...stored,
    classes: mergeClasses(previous.classes, next.classes, stored.classes),
    frames: stored.frames.map((frame) => {
      const original = before.get(frame.id);
      const edited = after.get(frame.id);

      if (!original || !edited || original === edited) return frame;

      return {
        ...frame,
        annotations: mergeEntries(
          original.annotations,
          edited.annotations,
          frame.annotations,
          (entry) => entry.instance,
        ),
      };
    }),
  };
}

function sameLabelChanges(left: FrameLabelState, right: FrameLabelState): boolean {
  return (
    JSON.stringify(left.classes) === JSON.stringify(right.classes) &&
    left.frames.every(
      (frame, index) => JSON.stringify(frame.annotations) === JSON.stringify(right.frames[index]?.annotations),
    )
  );
}

export function mergeFrameLabelChanges(input: {
  previous: FrameLabelState;
  next: FrameLabelState;
  stored: FrameLabelState;
}) {
  const labels = mergeLabelChanges(input.previous, input.next, input.stored);

  return { ...labels, same: sameLabelChanges(labels, input.next) };
}
