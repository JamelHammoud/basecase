import { canonicalJson } from '../skills/hash';
import { hashFrame, hashFrameSetManifest, manifestOf, type VisionClass, type VisionFrameSet } from './frameSet';

const classKey = ({ name, kind, keypoints }: VisionClass) => canonicalJson({ name, kind, keypoints });

export function mergeFrameSets(sets: VisionFrameSet[], seed: number): VisionFrameSet {
  const categoryKeys = [
    ...new Map(sets.flatMap((set) => set.classes.map((c) => [classKey(c), c] as const))).entries(),
  ].sort(([a], [b]) => a.localeCompare(b));
  const classes = categoryKeys.map(([, category], id) => ({ ...category, id }));
  const classIds = new Map(categoryKeys.map(([key], id) => [key, id]));
  const frames = sets.flatMap((set) => {
    const remap = new Map(set.classes.map((c) => [c.id, classIds.get(classKey(c))!]));

    return set.frames.map((frame) => {
      if (frame.annotations.every((a) => remap.get(a.classId) === a.classId)) return frame;

      const content = {
        ...frame,
        annotations: frame.annotations.map((a) => ({ ...a, classId: remap.get(a.classId)! })),
      };

      return { ...content, id: hashFrame(content) };
    });
  });
  const set: VisionFrameSet = {
    format: 'basecase-vision',
    version: 1,
    id: '',
    name: sets.map((s) => s.name).join(', ') || 'Training images',
    caseId: sets.length === 1 ? sets[0].caseId : 'mixed',
    seed,
    classes,
    frames: [...new Map(frames.map((frame) => [frame.id, frame])).values()],
  };

  return { ...set, id: hashFrameSetManifest(manifestOf(set)) };
}
