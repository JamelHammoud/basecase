import type { FrameSet, TrainingFrame } from './frameSet';
import type { FrozenImageSample } from '../datasets/snapshotImages';

export const MAX_CONDITIONS = 32;
export const MAX_FRAME_CONDITIONS = 8;

export interface ImageGroupMembership {
  camera: string;
  declared: string[];
  labels: string[];
}

export function validConditionNames(value: unknown, limit = MAX_CONDITIONS): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= limit &&
    value.every(
      (name) =>
        typeof name === 'string' &&
        name.length > 0 &&
        name.length <= 64 &&
        name === name.trim() &&
        [...name].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
    ) &&
    new Set(value).size === value.length
  );
}

export function validImageGroups(value: unknown): value is ImageGroupMembership {
  if (typeof value !== 'object' || value === null) return false;

  const groups = value as ImageGroupMembership;

  return (
    typeof groups.camera === 'string' &&
    groups.camera.trim().length > 0 &&
    groups.camera.length <= 200 &&
    validConditionNames(groups.declared) &&
    validConditionNames(groups.labels, MAX_FRAME_CONDITIONS) &&
    groups.labels.every((label) => groups.declared.includes(label))
  );
}

export function imageGroups(set: Pick<FrameSet, 'conditions'>, frame: Pick<TrainingFrame, 'camera' | 'conditions'>) {
  return { camera: frame.camera, declared: [...(set.conditions ?? [])], labels: [...(frame.conditions ?? [])] };
}

export function evaluationImageGroups(snapshot: FrozenImageSample[], sets: FrameSet[]): FrozenImageSample[] {
  const frames = new Map(
    sets.flatMap((set) => set.frames.map((frame) => [`${set.id}:${frame.id}`, { set, frame }] as const)),
  );

  return snapshot.map((sample) => {
    if (sample.groups) return sample;

    const match = frames.get(`${sample.frameSetId}:${sample.frameId}`);

    return match ? { ...sample, groups: imageGroups(match.set, match.frame) } : sample;
  });
}

export function validateConditionMembership(
  set: Pick<FrameSet, 'conditions'> & { frames: { conditions?: string[] }[] },
) {
  const names = new Set(set.conditions ?? []);

  if (set.frames.some((frame) => frame.conditions?.some((label) => !names.has(label))))
    throw new Error('Choose a declared image condition.');
}

export function applyFrameConditions<T extends Pick<TrainingFrame, 'id' | 'conditions'>>(
  set: Omit<FrameSet, 'frames'> & { frames: T[] },
  edit: { ids: string[]; name: string; remove: boolean },
): Omit<FrameSet, 'frames'> & { frames: T[] } {
  if (!validConditionNames([edit.name]) || edit.ids.length > 1000)
    throw new Error('Choose a condition name of up to 64 characters and at most 1,000 images.');

  const ids = new Set(edit.ids);
  const available = new Set(set.frames.map((frame) => frame.id));
  const conditions = edit.remove ? set.conditions : [...new Set([...(set.conditions ?? []), edit.name])];

  if ((conditions?.length ?? 0) > MAX_CONDITIONS || edit.ids.some((id) => !available.has(id)))
    throw new Error('Choose existing images and at most 32 conditions.');

  const frames = set.frames.map((frame) => {
    if (!ids.has(frame.id)) return frame;

    const labels = frame.conditions ?? [];

    if (edit.remove && !labels.includes(edit.name)) return frame;

    const next = edit.remove ? labels.filter((name) => name !== edit.name) : [...new Set([...labels, edit.name])];

    if (next.length > MAX_FRAME_CONDITIONS) throw new Error('Assign at most eight conditions to each image.');

    return { ...frame, conditions: next };
  });

  if (frames.every((frame, index) => frame === set.frames[index]) && conditions === set.conditions) return set;

  return { ...set, ...(conditions !== undefined ? { conditions } : {}), frames };
}
