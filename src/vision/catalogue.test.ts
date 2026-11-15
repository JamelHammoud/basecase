import { describe, expect, it } from 'vitest';
import { VISION_MODELS, visionModel } from './catalogue';
import { validateVisionManifest } from './manifest';

describe('built-in vision model manifests', () => {
  it('validates every pinned download and its image preprocessing', () => {
    expect(new Set(VISION_MODELS.map((model) => model.id)).size).toBe(VISION_MODELS.length);

    for (const model of VISION_MODELS) {
      expect(validateVisionManifest(model)).toEqual(model);
    }

    expect(visionModel('missing')).toBeUndefined();
    expect(visionModel('yunet')?.input).toMatchObject({ color: 'bgr', scale: 1 });
    expect(visionModel('yolo11n')?.input).toMatchObject({ color: 'rgb', scale: 1 / 255, resize: 'letterbox' });
  });

  it('preserves each detector’s COCO category indices', () => {
    const yolo = visionModel('yolo11n')!;
    const rfdetr = visionModel('rfdetr-nano')!;

    expect(yolo.classes).toHaveLength(80);
    expect(rfdetr.classes).toHaveLength(91);
    expect(yolo.classes[0]).toBe('person');
    expect(rfdetr.classes[0]).toBe('');
    expect(rfdetr.classes[1]).toBe('person');
    expect(rfdetr.classes[12]).toBe('');
    expect(rfdetr.classes[13]).toBe('stop sign');
    expect(rfdetr.classes[90]).toBe('toothbrush');
    expect(rfdetr.classes.filter(Boolean)).toEqual(yolo.classes);
  });
});
