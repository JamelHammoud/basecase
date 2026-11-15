import { describe, expect, it } from 'vitest';
import { decodeMask } from './imageMasks';
import type { FrameSet } from './frameSet';
import { validateFrameSet } from './frameSet';
import {
  acceptLabels,
  addLabelClass,
  commitLabels,
  createLabelHistory,
  deleteLabel,
  labelGeometry,
  putLabel,
  redoLabels,
  renameLabelClass,
  setLabelKeypoint,
  undoLabels,
} from './labelEdits';

function fixture(): FrameSet {
  return {
    version: 1,
    id: 'labels',
    name: 'Labels',
    caseId: null,
    sceneId: null,
    seed: 1,
    createdAt: '2026-11-15',
    classes: [{ id: 0, name: 'Cup' }],
    frames: ['first', 'second'].map((id) => ({
      id,
      seed: 1,
      camera: 'Camera',
      width: 8,
      height: 6,
      jpeg: new Uint8Array([255, 216, 255, 217]),
      depth: new Float32Array(48),
      annotations: [],
    })),
  };
}

const box = () => labelGeometry({ width: 8, height: 6, instance: 'cup', classId: 0, box: [1, 1, 4, 3] });

describe('frame label edits', () => {
  it('creates canonical masks, polygons and boxes from clipped manual shapes', () => {
    const set = putLabel(fixture(), 'first', box());
    const polygon = labelGeometry({
      width: 8,
      height: 6,
      instance: 'triangle',
      classId: 0,
      polygons: [[0, 0, 8, 0, 0, 6]],
    });
    const edited = putLabel(set, 'second', polygon);

    expect(edited.frames[0].annotations[0].box).toEqual([1, 1, 4, 3]);
    expect(edited.frames[0].annotations[0]).toMatchObject({ source: 'manual', review: 'accepted' });
    expect(() => validateFrameSet(edited)).not.toThrow();
    expect(() => labelGeometry({ width: 8, height: 6, instance: 'empty', classId: 0, box: [9, 9, 2, 2] })).toThrow();
    expect(edited.frames[0]).toBe(set.frames[0]);
    expect(edited.frames[0].jpeg).toBe(set.frames[0].jpeg);
  });

  it('preserves holes while editing canonical polygon rings', () => {
    const pixels = new Uint8Array(48).fill(1);

    pixels[18] = 0;
    pixels[19] = 0;

    const original = labelGeometry({ width: 8, height: 6, instance: 'ring', classId: 0, pixels });
    const edited = labelGeometry({
      width: 8,
      height: 6,
      instance: 'ring',
      classId: 0,
      polygons: original.polygons,
      preserveHoles: true,
    });

    expect(decodeMask(edited.mask)).toEqual(pixels);
  });

  it('adds named keypoints to the shared class and preserves another frame', () => {
    const initial = putLabel(fixture(), 'first', box());
    const edited = setLabelKeypoint(initial, {
      frameId: 'first',
      instance: 'cup',
      point: { name: 'handle', x: 3, y: 2, visible: true },
    });

    expect(edited.classes[0].keypoints).toEqual(['handle']);
    expect(edited.frames[0].annotations[0].keypoints).toEqual([{ name: 'handle', x: 3, y: 2, visible: true }]);
    expect(edited.frames[1]).toBe(initial.frames[1]);
    expect(() => validateFrameSet(edited)).not.toThrow();
    expect(() =>
      setLabelKeypoint(edited, {
        frameId: 'first',
        instance: 'cup',
        point: { name: 'handle', x: 8, y: 2, visible: true },
      }),
    ).toThrow();
  });

  it('renames one shared class across frames and rejects duplicate or blank names', () => {
    const initial = putLabel(putLabel(fixture(), 'first', box()), 'second', box());
    const edited = renameLabelClass(initial, 0, ' Mug ');
    const added = addLabelClass(edited, 'Bottle');

    expect(edited.classes[0].name).toBe('Mug');
    expect(edited.frames).toBe(initial.frames);
    expect(edited.frames.every((frame) => frame.annotations[0].classId === 0)).toBe(true);
    expect(added.classes.map((category) => category.name)).toEqual(['Mug', 'Bottle']);
    expect(() => renameLabelClass(added, 0, 'Bottle')).toThrow();
    expect(() => addLabelClass(added, ' ')).toThrow();
  });

  it('accepts only the selected frame suggestions and can undo every edit without copying images', () => {
    const suggested = { ...box(), review: 'suggested' as const, source: 'model' as const };
    const initial = putLabel(putLabel(fixture(), 'first', suggested), 'second', suggested);
    let history = createLabelHistory(initial);

    history = commitLabels(history, acceptLabels(history.present, 'first'));
    expect(history.present.frames[0].annotations[0].review).toBe('accepted');
    expect(history.present.frames[1].annotations[0].review).toBe('suggested');
    history = commitLabels(history, renameLabelClass(history.present, 0, 'Mug'));
    history = commitLabels(history, deleteLabel(history.present, 'first', 'cup'));
    expect(history.present.frames[0].annotations).toEqual([]);
    history = undoLabels(undoLabels(undoLabels(history)));
    expect(history.present).toBe(initial);
    history = redoLabels(redoLabels(redoLabels(history)));
    expect(history.present.classes[0].name).toBe('Mug');
    expect(history.present.frames[0].annotations).toEqual([]);
    expect(history.present.frames[0].jpeg).toBe(initial.frames[0].jpeg);
    history = undoLabels(history);
    history = commitLabels(history, addLabelClass(history.present, 'Jar'));
    expect(history.future).toEqual([]);
    expect(commitLabels(history, history.present)).toBe(history);
  });
});
