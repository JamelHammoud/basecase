import { describe, expect, it } from 'vitest';
import { createLabelDocumentHistory } from './labelDocumentHistory';
import { labelGeometry, putLabel, renameLabelClass, setLabelKeypoint } from '../../vision/labelEdits';
import type { FrameSet } from '../../vision/frameSet';

function fixture(): FrameSet {
  return {
    version: 1,
    id: 'set',
    name: 'Frames',
    caseId: null,
    sceneId: null,
    seed: 1,
    createdAt: 'now',
    classes: [{ id: 0, name: 'Cup' }],
    frames: [
      {
        id: 'frame',
        camera: 'Camera',
        seed: 1,
        width: 8,
        height: 6,
        jpeg: new Uint8Array([255, 216, 255, 217]),
        depth: new Float32Array(48),
        annotations: [labelGeometry({ width: 8, height: 6, instance: 'cup', classId: 0, box: [1, 1, 4, 3] })],
      },
    ],
  };
}

describe('event-time label document history', () => {
  it('preserves a blur rename when a keypoint event callback from the same render follows it', () => {
    const document = createLabelDocumentHistory(fixture());
    const renameOnBlur = () => document.edit((set) => renameLabelClass(set, 0, 'Mug'));
    const pointOnPointerDown = () =>
      document.edit((set) =>
        setLabelKeypoint(set, {
          frameId: 'frame',
          instance: 'cup',
          point: { name: 'handle', x: 3, y: 2, visible: true },
        }),
      );

    renameOnBlur();

    const edited = pointOnPointerDown();

    expect(edited.present.classes[0]).toMatchObject({ name: 'Mug', keypoints: ['handle'] });
    expect(edited.present.frames[0].annotations[0].keypoints[0].name).toBe('handle');
    expect(document.undo().present.classes[0].name).toBe('Mug');
    expect(document.undo().present.classes[0].name).toBe('Cup');
  });

  it('applies a delayed model label to the current document after a blur rename', async () => {
    const document = createLabelDocumentHistory(fixture());
    const model = labelGeometry({ width: 8, height: 6, instance: 'model', classId: 0, box: [2, 1, 2, 2] });
    const applyModelFromPreviousRender = async () => {
      const annotation = await Promise.resolve(model);

      return document.edit((set) => putLabel(set, 'frame', annotation));
    };
    const pending = applyModelFromPreviousRender();

    document.edit((set) => renameLabelClass(set, 0, 'Mug'));

    const edited = await pending;

    expect(edited.present.classes[0].name).toBe('Mug');
    expect(edited.present.frames[0].annotations.map((label) => label.instance)).toEqual(['cup', 'model']);
    expect(document.undo().present.classes[0].name).toBe('Mug');
    expect(document.redo().present.frames[0].annotations).toHaveLength(2);
  });
});
